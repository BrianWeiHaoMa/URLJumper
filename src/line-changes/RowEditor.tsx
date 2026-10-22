// The row editor (In use, "Edit from a suggestion" and "Edit the list"; G12, G13, G14, G21, G31, L2): name,
// URL, and note fields filled from one mapping line as loaded, each with a copy button at its right that copies
// the field's value as it stands (G31), with *Save*, which rewrites that line alone, *Delete*, which removes it
// at once and asks nothing, *Copy link* where the host offers it, *Move up* and *Move down* where the host
// offers them, each moving the line at once, *Open in text* where the host offers it, and *Cancel*, which
// stores nothing. The line is the anchor from the read the editor was opened on, which no later read moves: a
// change the worker finds stale stores nothing, and the editor says what became of the line and offers *Edit
// again*, which anchors on the line as it now stands, keeping the typed values, or, the line gone, saves them
// as a new line at the end (G9). Only the host moves it otherwise, keeping the editor open on the line a move
// left. Its checks come from the document module against the document as last read, so a Save that keeps its
// name is never blocked as taken, a taken name is named, with the offer to edit that line instead, beside any
// other problem (G8), and a move the document does not admit is offered disabled, saying why (G12). While a
// change awaits its reply the fields take no typing and every action waits, so the reply lands on the editor
// that sent it (G21). It never reads storage, closes its host, or shows a confirmation: a stored change's
// outcome goes to the host. It writes only through the worker's requests (R1); no key deletes or moves a line
// (P1).
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { anchorAt, type Anchor } from '../document/anchor';
import { mappingOfLine } from '../document/grammar';
import { movesAdmitted, type MoveDirection, type MoveOffer } from '../document/moving';
import type { MappingFields } from '../document/validation';
import { chromeMessage, send, type InsertReply } from '../requests';
import { editInsteadText, fieldProblemText, refusedValuesText, takenNameText } from './field-problems';
import { copyField, copySays, copyText, MappingField, type FieldName, type Said } from './MappingField';
import { insertedOutcome, movedOutcome, removedOutcome, rewrittenOutcome, type Outcome } from './outcomes';
import { attemptFooter, destination, lineFields, moveFooter, notMovedText, saveCheck, textViewLine, whatBecameOf, type Became, type SaveCheck } from './row-editor';
import './line-form.css';
import './row-editor.css';

export interface RowEditorProps {
  /** The stored document as last read, given again after every read. */
  document: string;
  /** The line as loaded: its number and exact text from the read the editor was opened on; given anew by a host that keeps the editor open on the line a move left, which the editor then edits. */
  anchor: Anchor;
  /** *Copy link*, offered only when given, with the argument of the row it was opened from: the argument row's, else null, which fills the URL it copies. */
  copyLink?: { argument: string | null };
  /** The name field, where the editor starts, which a host gives the focus as the notice of what is new does. */
  start: RefObject<HTMLInputElement | null>;
  /** Opens the Text view on line N, the host's way; *Open in text* is offered only when it is given. A rejection is said in the editor. */
  openInText?(line: number): Promise<void>;
  /** Whether *Move up* and *Move down* are offered. */
  offersMoves?: boolean;
  /** A change stored: the host confirms the outcome and closes the editor, or, after a move, keeps it open on the line, which the editor is then ready to change again. */
  onStored(outcome: Outcome): void;
  /** *Edit "‹name›" instead*: the host opens the editor on that line, its anchor from the document the editor last rendered. */
  onEditInstead(anchor: Anchor): void;
  /** *Cancel*: the host closes the editor, nothing stored. */
  onBack(): void;
  /** Called with what Enter does where the focus is in the editor, whenever that changes (L2). */
  sayWhatEnterDoes(text: string): void;
  /** Called with true as a change is sent and with false as its reply lands, so a host can hold its other edits meanwhile (G21). */
  onBusy?(busy: boolean): void;
}

/** The editor's controls, by which the footer says what Enter does. */
type Control = 'field' | `copy-${FieldName}` | 'save' | 'delete' | 'copy' | 'move-up' | 'move-down' | 'open' | 'cancel' | 'edit-again' | 'edit-instead';

/** The changes the editor sends. */
type Change = 'save' | 'delete' | 'move';

/** What a change the worker found stale met: what became of the line, by the reply's stored document. */
interface Stale {
  by: Change;
  became: Became;
}

export function RowEditor({ document: stored, anchor: loaded, copyLink, start, openInText, offersMoves, onStored, onEditInstead, onBack, sayWhatEnterDoes, onBusy }: RowEditorProps) {
  const problemId = `${useId()}-problem`;
  const [anchor, setAnchor] = useAnchor(loaded);
  const [fields, setFields] = useState<MappingFields>(() => lineFields(loaded.text));
  const [focused, setFocused] = useState<Control | null>(null);
  const check = useMemo(() => saveCheck(stored, anchor, fields), [stored, anchor, fields]);
  const textLine = useMemo(() => (anchor === null ? undefined : textViewLine(stored, anchor)), [stored, anchor]);
  // Once per read of the document, which can be ten thousand lines.
  const moves = useMemo(() => (offersMoves && anchor !== null ? movesAdmitted(stored, anchor) : null), [offersMoves, stored, anchor]);
  const writes = useWrites(onStored, onBusy);
  const { busy, stale, said, setSaid } = writes;

  const actions: EditorActions = {
    save: () => {
      if (check.problem === null && check.takenBy === null) void writes.write('save', () => saveFields(anchor, fields, check.line));
    },
    delete: () => {
      if (anchor !== null) void writes.write('delete', () => deleteLine(anchor));
    },
    move: (direction) => {
      if (anchor !== null && moves !== null && moves[direction].kind !== 'immovable') void writes.write('move', () => moveLine(anchor, direction));
    },
    // Inside the click or key handler, which the clipboard needs (S14); it opens nothing and records no use.
    copyLink: () => {
      if (!writes.inFlight() && anchor !== null && copyLink !== undefined) copyDestination(anchor, copyLink.argument, setSaid);
    },
    // The field's value as it stands, typed or not, whatever its problem.
    copyField: (field) => {
      if (!writes.inFlight()) copyField(field, fields[field], setSaid);
    },
    openText: () => {
      if (writes.inFlight() || anchor === null || openInText === undefined) return;
      setSaid(null);
      openInText(textLine ?? anchor.line).catch((error: unknown) => setSaid({ text: `The Text view did not open. Chrome said: ${chromeMessage(error)}`, alert: true }));
    },
    cancel: () => {
      if (!writes.inFlight()) onBack();
    },
    editAgain: () => {
      if (writes.inFlight() || stale === null) return;
      setAnchor(stale.became.kind === 'changed' ? stale.became.now : null);
      writes.clearStale();
      // Its button goes with the message: the focus goes to where the editor starts.
      start.current?.focus();
    },
    editInstead: () => {
      const other = check.takenBy === null ? undefined : anchorAt(stored, check.takenBy.line);
      if (!writes.inFlight() && other !== undefined) onEditInstead(other);
    },
  };
  const edit = (field: keyof MappingFields) => (value: string) => {
    setSaid(null);
    setFields((was) => ({ ...was, [field]: value }));
  };

  useStartFocus(start, check.takenBy?.line, stale);
  const enterSays = whatEnterDoes(focused, { busy, stale, anchor, check, textLine, fields, moves });
  useEffect(() => sayWhatEnterDoes(enterSays), [enterSays, sayWhatEnterDoes]);

  return (
    <form
      className="row-editor"
      noValidate
      onSubmit={(event) => {
        // Enter in a field saves, as *Save* does; nothing in the editor opens a URL (R4).
        event.preventDefault();
        actions.save();
      }}
      onFocus={(event) => setFocused(controlOf(event.target))}
      onBlur={() => setFocused(null)}
    >
      {anchor === null && (
        <p className="row-editor-note">
          "{mappingOfLine(loaded.text)?.name ?? ''}" is no longer in the document: Save adds your values as a new line, line {check.line}.
        </p>
      )}
      <MappingField field="name" value={fields.name} readOnly={busy !== null} waiting={busy !== null} invalid={check.takenBy !== null || check.problem?.field === 'name'} describedBy={problemId} input={start} onChange={edit('name')} onCopy={actions.copyField} />
      <MappingField field="url" value={fields.url} readOnly={busy !== null} waiting={busy !== null} invalid={check.problem?.field === 'url'} describedBy={problemId} onChange={edit('url')} onCopy={actions.copyField} />
      <MappingField field="note" value={fields.note} readOnly={busy !== null} waiting={busy !== null} invalid={check.problem?.field === 'note'} describedBy={problemId} onChange={edit('note')} onCopy={actions.copyField} />
      <p id={problemId} className="form-problem" aria-live="polite">
        {check.problem === null ? '' : fieldProblemText(check.problem, check.line, fields.url)}
      </p>
      <EditorMessages check={check} stale={stale} said={said} loaded={loaded} busy={busy !== null} actions={actions} />
      <EditorButtons anchor={anchor} offersCopy={copyLink !== undefined} offersOpen={openInText !== undefined} moves={moves} saveOff={busy !== null || stale !== null || check.problem !== null || check.takenBy !== null} busy={busy !== null} stale={stale !== null} actions={actions} />
    </form>
  );
}

/** What the editor's controls do, each waiting while a change awaits its reply. */
interface EditorActions {
  save(): void;
  delete(): void;
  move(direction: MoveDirection): void;
  copyLink(): void;
  copyField(field: FieldName): void;
  openText(): void;
  cancel(): void;
  editAgain(): void;
  editInstead(): void;
}

/**
 * The line the editor changes: the one it was opened on, until *Edit again* moves it to the line as it now
 * stands, or to none, a new line at the end; or until the host gives it anew, the line where a move left it.
 */
function useAnchor(loaded: Anchor) {
  const [anchor, setAnchor] = useState<Anchor | null>(loaded);
  const [given, setGiven] = useState(loaded);
  if (given.line !== loaded.line || given.text !== loaded.text) {
    setGiven(loaded);
    setAnchor(loaded);
  }
  return [anchor, setAnchor] as const;
}

/**
 * The editor's writes (G13, G21): one change at a time, its outcome handed to the host; a stale reply kept as
 * what became of the line until *Edit again*; and what the last action came to when it stored nothing.
 */
function useWrites(onStored: (outcome: Outcome) => void, onBusy: ((busy: boolean) => void) | undefined) {
  const [busy, setBusy] = useState<Change | null>(null);
  const inFlight = useRef(false);
  const [stale, setStale] = useState<Stale | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const write = async (by: Change, request: () => Promise<Written>) => {
    if (inFlight.current || stale !== null) return;
    inFlight.current = true;
    setBusy(by);
    setSaid(null);
    onBusy?.(true);
    const written = await request();
    onBusy?.(false);
    if ('outcome' in written) onStored(written.outcome);
    // Every stored change but a move closes the editor; after a move the host keeps it open, and it is ready again.
    if ('outcome' in written && written.outcome.kind !== 'moved') return;
    inFlight.current = false;
    setBusy(null);
    if ('became' in written) setStale({ by, became: written.became });
    else if ('refusal' in written) setSaid({ text: written.refusal, alert: true });
  };
  const clearStale = () => {
    setStale(null);
    setSaid(null);
  };
  return { busy, stale, said, setSaid, write, clearStale, inFlight: () => inFlight.current };
}

/** What a write came to: stored, with its outcome; refused as stale, with what became of the line; or refused for this reason. */
type Written = { outcome: Outcome } | { became: Became } | { refusal: string };

/** Save of `fields` over the line `anchor` names, or, with none, as a new line at the end of the document, `line` the line it would be. */
async function saveFields(anchor: Anchor | null, fields: MappingFields, line: number): Promise<Written> {
  const { name, url, note } = fields;
  if (anchor === null) {
    const reply = await send({ kind: 'insert', name, url, note, heading: null });
    return reply.kind === 'applied' ? { outcome: insertedOutcome(reply) } : { refusal: notSaved(reply, line, url) };
  }
  const reply = await send({ kind: 'rewrite', line: anchor.line, text: anchor.text, name, url, note });
  if (reply.kind === 'applied') return { outcome: rewrittenOutcome(reply, anchor.text) };
  return reply.kind === 'stale' ? { became: whatBecameOf(reply.document, anchor) } : { refusal: notSaved(reply, line, url) };
}

/** Delete of the line `anchor` names, at once. */
async function deleteLine(anchor: Anchor): Promise<Written> {
  const reply = await send({ kind: 'remove', line: anchor.line, text: anchor.text });
  if (reply.kind === 'applied') return { outcome: removedOutcome(reply) };
  return reply.kind === 'stale' ? { became: whatBecameOf(reply.document, anchor) } : { refusal: `Not deleted: nothing was stored. Chrome said: ${reply.message}` };
}

/** A move of the line `anchor` names one mapping line up or down, at once (G12). */
async function moveLine(anchor: Anchor, direction: MoveDirection): Promise<Written> {
  const reply = await send({ kind: 'move', line: anchor.line, text: anchor.text, direction });
  if (reply.kind === 'applied') return { outcome: movedOutcome(reply) };
  if (reply.kind === 'stale') return { became: whatBecameOf(reply.document, anchor) };
  return { refusal: reply.kind === 'immovable' ? notMovedText(reply.document, anchor, direction) : `Not moved: nothing was stored. Chrome said: ${reply.message}` };
}

/** Puts the destination of the line `anchor` names on the clipboard (G31), saying what came of it. */
function copyDestination(anchor: Anchor, argument: string | null, say: (said: Said | null) => void) {
  const link = destination(anchor.text, argument);
  if (link === undefined) {
    say({ text: 'Not copied: the link is longer than Chrome opens.', alert: true });
    return;
  }
  copyText(link, 'Copied the link', say);
}

/**
 * The name field has the focus as the editor appears, with the caret after the name. A part that held the
 * focus can go with what showed it (*Edit instead* once the name is free, *Edit again* with its message): the
 * focus then goes to the name field, never to nothing (G32). Keyed to those parts, not run on every render:
 * a control blurred on purpose leaves the focus nowhere until the next one takes it.
 */
function useStartFocus(start: RefObject<HTMLInputElement | null>, takenLine: number | undefined, stale: Stale | null) {
  useLayoutEffect(() => {
    const field = start.current;
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }, [start]);
  useLayoutEffect(() => {
    if (document.activeElement === document.body) start.current?.focus();
  }, [takenLine, stale, start]);
}

interface EditorMessagesProps {
  check: SaveCheck;
  stale: Stale | null;
  said: Said | null;
  loaded: Anchor;
  busy: boolean;
  actions: EditorActions;
}

/** The taken name with its offer to edit that line instead (G8), what became of a stale line with *Edit again* (G13), and what the last action came to. */
function EditorMessages({ check, stale, said, loaded, busy, actions }: EditorMessagesProps) {
  return (
    <>
      {check.takenBy !== null && (
        <div className="row-editor-taken">
          <p className="row-editor-taken-text">{takenNameText(check.takenBy)}</p>
          <button type="button" className="form-button edit-instead" data-control="edit-instead" aria-disabled={busy} onClick={actions.editInstead}>
            {editInsteadText(check.takenBy)}
          </button>
        </div>
      )}
      {stale !== null && (
        <div className="row-editor-stale">
          <p className="row-editor-stale-text" role="alert">
            {staleText(stale, loaded)}
          </p>
          {stale.became.kind === 'changed' && <pre className="row-editor-line">{stale.became.now.text}</pre>}
          <button type="button" className="form-button" data-control="edit-again" onClick={actions.editAgain}>
            Edit again
          </button>
        </div>
      )}
      {said !== null && (
        <p className={said.alert ? 'form-said row-editor-said refused' : 'form-said row-editor-said'} role={said.alert ? 'alert' : 'status'}>
          {said.text}
        </p>
      )}
    </>
  );
}

interface EditorButtonsProps {
  /** None for a line gone, saved as a new line, which offers nothing to delete, copy, move, or open. */
  anchor: Anchor | null;
  offersCopy: boolean;
  offersOpen: boolean;
  /** What each move would come to, where the host offers moves; null where it does not. */
  moves: Record<MoveDirection, MoveOffer> | null;
  saveOff: boolean;
  busy: boolean;
  stale: boolean;
  actions: EditorActions;
}

/**
 * *Save*, *Delete*, *Copy link*, *Move up* and *Move down*, *Open in text*, and *Cancel*; none of them a key (P1).
 * The moves are arrows, on a line of their own with *Cancel*.
 */
function EditorButtons({ anchor, offersCopy, offersOpen, moves, saveOff, busy, stale, actions }: EditorButtonsProps) {
  const cancel = (
    <button type="button" className="form-button" data-control="cancel" aria-disabled={busy} onClick={actions.cancel}>
      Cancel
    </button>
  );
  const moving = anchor !== null && moves !== null;
  return (
    <div className="form-actions">
      <button type="submit" className="form-button save" data-control="save" aria-disabled={saveOff}>
        Save
      </button>
      {anchor !== null && (
        <>
          <button type="button" className="form-button" data-control="delete" aria-disabled={busy || stale} onClick={actions.delete}>
            Delete
          </button>
          {offersCopy && (
            <button type="button" className="form-button" data-control="copy" aria-disabled={busy} onClick={actions.copyLink}>
              Copy link
            </button>
          )}
          {offersOpen && (
            <button type="button" className="form-button" data-control="open" aria-disabled={busy} onClick={actions.openText}>
              Open in text
            </button>
          )}
        </>
      )}
      {moving ? (
        <div className="row-editor-moves">
          {(['up', 'down'] as const).map((direction) => (
            // Still reached by Tab where the document does not admit it, its footer saying why (G32, L2).
            <button
              key={direction}
              type="button"
              className="form-button row-editor-move"
              data-control={`move-${direction}`}
              aria-label={MOVE_LABEL[direction]}
              title={MOVE_LABEL[direction]}
              aria-disabled={busy || stale || moves[direction].kind === 'immovable'}
              onClick={() => actions.move(direction)}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
                <path d={MOVE_ARROW[direction]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
          {cancel}
        </div>
      ) : (
        cancel
      )}
    </div>
  );
}

const MOVE_LABEL: Record<MoveDirection, string> = { up: 'Move up', down: 'Move down' };
const MOVE_ARROW: Record<MoveDirection, string> = { up: 'M8 13.5v-11M3.5 7 8 2.5 12.5 7', down: 'M8 2.5v11M3.5 9 8 13.5 12.5 9' };

function controlOf(target: EventTarget): Control {
  return target instanceof HTMLElement && target.dataset.control ? (target.dataset.control as Control) : 'field';
}

/** What a refusal of Save, a rewrite's or an insert's, says: the rule or the name the worker found, or Chrome's message (G21). */
function notSaved(reply: Exclude<InsertReply, { kind: 'applied' }>, line: number, url: string): string {
  return reply.kind === 'storage-failed' ? `Not saved: nothing was stored. Chrome said: ${reply.message}` : refusedValuesText(reply, line, url);
}

const NOT_DONE = { save: 'Not saved', delete: 'Not deleted', move: 'Not moved' } as const;

/** What became of the line, said where the change was refused (G13): nothing was stored. */
function staleText({ by, became }: Stale, loaded: Anchor): string {
  const refused = NOT_DONE[by];
  const name = mappingOfLine(loaded.text)?.name ?? '';
  if (became.kind === 'changed') return `${refused}: line ${loaded.line}, "${name}", was changed since this editor opened, and nothing was stored. It is now line ${became.now.line}:`;
  return `${refused}: line ${loaded.line}, "${name}", has gone from the document since this editor opened, and nothing was stored.`;
}

interface EditorState {
  busy: Change | null;
  stale: Stale | null;
  anchor: Anchor | null;
  check: SaveCheck;
  /** The line *Open in text* names; undefined with no anchor, where it is not offered. */
  textLine: number | undefined;
  fields: MappingFields;
  moves: Record<MoveDirection, MoveOffer> | null;
}

/** What Enter does with the focus on `focused` (L2); like every footer it holds no name or URL, which can be as long as the document. */
function whatEnterDoes(focused: Control | null, { busy, stale, anchor, check, textLine, fields, moves }: EditorState): string {
  if (busy === 'save') return 'Saving · Enter does nothing until it is stored';
  if (busy === 'delete') return 'Deleting · Enter does nothing until it is stored';
  if (busy === 'move') return 'Moving · Enter does nothing until it is stored';
  switch (focused) {
    case null:
      return 'Enter does nothing';
    case 'cancel':
      return 'Enter closes the editor, storing nothing';
    case 'copy':
      return 'Enter copies the link';
    case 'copy-name':
    case 'copy-url':
    case 'copy-note':
      return copySays(focused.slice('copy-'.length) as FieldName);
    case 'open':
      return `Enter opens the Text view in a new tab at line ${textLine}`;
    case 'edit-instead':
      return `Enter edits line ${check.takenBy?.line ?? ''} instead`;
    case 'edit-again':
      return stale?.became.kind === 'changed' ? `Enter edits line ${stale.became.now.line} as it is now, keeping your values` : 'Enter edits again, to save your values as a new line';
    case 'delete':
      if (stale !== null) return 'Enter does nothing · Edit again first';
      return check.stale ? attemptFooter(`delete line ${check.line}`) : `Enter deletes line ${check.line}`;
    case 'move-up':
    case 'move-down': {
      const direction = focused === 'move-up' ? 'up' : 'down';
      return stale !== null || moves === null ? 'Enter does nothing · Edit again first' : moveFooter(direction, moves[direction], check.line);
    }
  }
  if (stale !== null) return 'Enter does nothing · Edit again first';
  if (check.takenBy !== null) return `Enter does nothing · Line ${check.takenBy.line} already has this name.`;
  if (check.problem !== null) return `Enter does nothing · ${fieldProblemText(check.problem, check.line, fields.url)}`;
  if (anchor === null) return `Enter saves it as line ${check.line}`;
  return check.stale ? attemptFooter(`save line ${check.line}`) : `Enter saves line ${check.line}`;
}

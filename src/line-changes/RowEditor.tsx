// The row editor (In use, "Edit from a suggestion"; G12, G13, G14, G21, G31, L2): name, URL, and note fields
// filled from one mapping line as loaded, with *Save*, which rewrites that line alone, *Delete*, which removes
// it at once and asks nothing, *Copy link*, *Open in text* where the host offers it, and *Cancel*, which stores
// nothing. The line is the anchor from the read the editor was opened on, which no later read moves: a Save or
// Delete the worker finds stale stores nothing, and the editor says what became of the line and offers *Edit
// again*, which anchors on the line as it now stands, keeping the typed values, or, the line gone, saves them as
// a new line at the end (G9). Its checks come from the document module against the document as last read, so
// a Save that keeps its name is never blocked as taken, and a taken name is named, with the offer to edit that
// line instead, beside any other problem (G8). While a Save or Delete awaits its reply the fields take no
// typing and every action waits, so the reply lands on the editor that sent it (G21). It never reads storage,
// closes its host, or shows a confirmation: a stored change's outcome goes to the host. It writes only
// through the worker's requests (R1); no key deletes a line (P1).
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { anchorAt, type Anchor } from '../document/anchor';
import { mappingOfLine } from '../document/grammar';
import type { MappingFields } from '../document/validation';
import { chromeMessage, send, type InsertReply } from '../requests';
import { editInsteadText, fieldProblemText, refusedValuesText, takenNameText } from './field-problems';
import { insertedOutcome, removedOutcome, rewrittenOutcome, type Outcome } from './outcomes';
import { destination, lineFields, saveCheck, textViewLine, whatBecameOf, type Became, type SaveCheck } from './row-editor';
import './line-form.css';
import './row-editor.css';

export interface RowEditorProps {
  /** The stored document as last read, given again after every read. */
  document: string;
  /** The line as loaded: its number and exact text from the read the editor was opened on. */
  anchor: Anchor;
  /** The argument of the row it was opened from: the argument row's, else null; *Copy link* fills the URL with it. */
  argument: string | null;
  /** The name field, where the editor starts, which a host gives the focus as the notice of what is new does. */
  start: RefObject<HTMLInputElement | null>;
  /** Opens the Text view on line N, the host's way; *Open in text* is offered only when it is given. A rejection is said in the editor. */
  openInText?(line: number): Promise<void>;
  /** A change stored: the host closes the editor and confirms the outcome. */
  onStored(outcome: Outcome): void;
  /** *Edit "‹name›" instead*: the host opens the editor on that line, its anchor from the document the editor last rendered. */
  onEditInstead(anchor: Anchor): void;
  /** *Cancel*: the host closes the editor, nothing stored. */
  onBack(): void;
  /** Called with what Enter does where the focus is in the editor, whenever that changes (L2). */
  sayWhatEnterDoes(text: string): void;
}

/** The editor's controls, by which the footer says what Enter does. */
type Control = 'field' | 'save' | 'delete' | 'copy' | 'open' | 'cancel' | 'edit-again' | 'edit-instead';

/** What a Save or Delete the worker found stale met: what became of the line, by the reply's stored document. */
interface Stale {
  by: 'save' | 'delete';
  became: Became;
}

/** What the last action came to when it stored nothing, or what *Copy link* did. */
interface Said {
  text: string;
  alert: boolean;
}

export function RowEditor({ document: stored, anchor: loaded, argument, start, openInText, onStored, onEditInstead, onBack, sayWhatEnterDoes }: RowEditorProps) {
  const problemId = `${useId()}-problem`;
  // Only *Edit again* moves it: to the line as it now stands, or to none, a new line at the end.
  const [anchor, setAnchor] = useState<Anchor | null>(loaded);
  const [fields, setFields] = useState<MappingFields>(() => lineFields(loaded.text));
  const [focused, setFocused] = useState<Control | null>(null);
  const check = useMemo(() => saveCheck(stored, anchor, fields), [stored, anchor, fields]);
  const textLine = useMemo(() => (anchor === null ? undefined : textViewLine(stored, anchor)), [stored, anchor]);
  const writes = useWrites(onStored);
  const { busy, stale, said, setSaid } = writes;

  const actions: EditorActions = {
    save: () => {
      if (check.problem === null && check.takenBy === null) void writes.write('save', () => saveFields(anchor, fields, check.line));
    },
    delete: () => {
      if (anchor !== null) void writes.write('delete', () => deleteLine(anchor));
    },
    // Inside the click or key handler, which the clipboard needs (S14); it opens nothing and records no use.
    copyLink: () => {
      if (!writes.inFlight() && anchor !== null) copyDestination(anchor, argument, setSaid);
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
  const enterSays = whatEnterDoes(focused, { busy, stale, anchor, check, textLine, fields });
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
      <Field label="Name" value={fields.name} readOnly={busy !== null} invalid={check.takenBy !== null || check.problem?.field === 'name'} describedBy={problemId} input={start} onChange={edit('name')} />
      <Field label="URL" url value={fields.url} readOnly={busy !== null} invalid={check.problem?.field === 'url'} describedBy={problemId} onChange={edit('url')} />
      <Field label="Note" value={fields.note} readOnly={busy !== null} invalid={check.problem?.field === 'note'} describedBy={problemId} onChange={edit('note')} />
      <p id={problemId} className="form-problem" aria-live="polite">
        {check.problem === null ? '' : fieldProblemText(check.problem, check.line, fields.url)}
      </p>
      <EditorMessages check={check} stale={stale} said={said} loaded={loaded} busy={busy !== null} actions={actions} />
      <EditorButtons anchor={anchor} offersOpen={openInText !== undefined} saveOff={busy !== null || stale !== null || check.problem !== null || check.takenBy !== null} busy={busy !== null} stale={stale !== null} actions={actions} />
    </form>
  );
}

/** What the editor's controls do, each waiting while a Save or Delete awaits its reply. */
interface EditorActions {
  save(): void;
  delete(): void;
  copyLink(): void;
  openText(): void;
  cancel(): void;
  editAgain(): void;
  editInstead(): void;
}

/**
 * The editor's writes (G13, G21): one Save or Delete at a time, its outcome handed to the host; a stale reply
 * kept as what became of the line until *Edit again*; and what the last action came to when it stored nothing.
 */
function useWrites(onStored: (outcome: Outcome) => void) {
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const inFlight = useRef(false);
  const [stale, setStale] = useState<Stale | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const write = async (by: 'save' | 'delete', request: () => Promise<Written>) => {
    if (inFlight.current || stale !== null) return;
    inFlight.current = true;
    setBusy(by);
    setSaid(null);
    const written = await request();
    if ('outcome' in written) return onStored(written.outcome);
    inFlight.current = false;
    setBusy(null);
    if ('became' in written) setStale({ by, became: written.became });
    else setSaid({ text: written.refusal, alert: true });
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

/** Puts the destination of the line `anchor` names on the clipboard (G31), saying what came of it. */
function copyDestination(anchor: Anchor, argument: string | null, say: (said: Said | null) => void) {
  const link = destination(anchor.text, argument);
  if (link === undefined) {
    say({ text: 'Not copied: the link is longer than Chrome opens.', alert: true });
    return;
  }
  say(null);
  navigator.clipboard.writeText(link).then(
    () => say({ text: 'Copied the link', alert: false }),
    (error: unknown) => say({ text: `Not copied. Chrome said: ${chromeMessage(error)}`, alert: true }),
  );
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
        <p className={said.alert ? 'row-editor-said refused' : 'row-editor-said'} role={said.alert ? 'alert' : 'status'}>
          {said.text}
        </p>
      )}
    </>
  );
}

interface EditorButtonsProps {
  /** None for a line gone, saved as a new line, which offers nothing to delete, copy, or open. */
  anchor: Anchor | null;
  offersOpen: boolean;
  saveOff: boolean;
  busy: boolean;
  stale: boolean;
  actions: EditorActions;
}

/** *Save*, *Delete*, *Copy link*, *Open in text*, and *Cancel*; none of them a key (P1). */
function EditorButtons({ anchor, offersOpen, saveOff, busy, stale, actions }: EditorButtonsProps) {
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
          <button type="button" className="form-button" data-control="copy" aria-disabled={busy} onClick={actions.copyLink}>
            Copy link
          </button>
          {offersOpen && (
            <button type="button" className="form-button" data-control="open" aria-disabled={busy} onClick={actions.openText}>
              Open in text
            </button>
          )}
        </>
      )}
      <button type="button" className="form-button" data-control="cancel" aria-disabled={busy} onClick={actions.cancel}>
        Cancel
      </button>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  /** A URL field, drawn as addresses are. */
  url?: boolean;
  readOnly: boolean;
  invalid: boolean;
  describedBy: string;
  input?: RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
}

function Field({ label, value, url, readOnly, invalid, describedBy, input, onChange }: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        ref={input}
        className={url ? 'field-input field-url' : 'field-input'}
        type="text"
        inputMode={url ? 'url' : undefined}
        autoComplete="off"
        autoCapitalize={url ? 'off' : undefined}
        spellCheck={false}
        readOnly={readOnly}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function controlOf(target: EventTarget): Control {
  return target instanceof HTMLElement && target.dataset.control ? (target.dataset.control as Control) : 'field';
}

/** What a refusal of Save, a rewrite's or an insert's, says: the rule or the name the worker found, or Chrome's message (G21). */
function notSaved(reply: Exclude<InsertReply, { kind: 'applied' }>, line: number, url: string): string {
  return reply.kind === 'storage-failed' ? `Not saved: nothing was stored. Chrome said: ${reply.message}` : refusedValuesText(reply, line, url);
}

/** What became of the line, said where the change was refused (G13): nothing was stored. */
function staleText({ by, became }: Stale, loaded: Anchor): string {
  const refused = by === 'save' ? 'Not saved' : 'Not deleted';
  const name = mappingOfLine(loaded.text)?.name ?? '';
  if (became.kind === 'changed') return `${refused}: line ${loaded.line}, "${name}", was changed since this editor opened, and nothing was stored. It is now line ${became.now.line}:`;
  return `${refused}: line ${loaded.line}, "${name}", has gone from the document since this editor opened, and nothing was stored.`;
}

interface EditorState {
  busy: 'save' | 'delete' | null;
  stale: Stale | null;
  anchor: Anchor | null;
  check: SaveCheck;
  /** The line *Open in text* names; undefined with no anchor, where it is not offered. */
  textLine: number | undefined;
  fields: MappingFields;
}

/** What Enter does with the focus on `focused` (L2); like every footer it holds no name or URL, which can be as long as the document. */
function whatEnterDoes(focused: Control | null, { busy, stale, anchor, check, textLine, fields }: EditorState): string {
  if (busy === 'save') return 'Saving · Enter does nothing until it is stored';
  if (busy === 'delete') return 'Deleting · Enter does nothing until it is stored';
  switch (focused) {
    case null:
      return 'Enter does nothing';
    case 'cancel':
      return 'Enter closes the editor, storing nothing';
    case 'copy':
      return 'Enter copies the link';
    case 'open':
      return `Enter opens the Text view in a new tab at line ${textLine}`;
    case 'edit-instead':
      return `Enter edits line ${check.takenBy?.line ?? ''} instead`;
    case 'edit-again':
      return stale?.became.kind === 'changed' ? `Enter edits line ${stale.became.now.line} as it is now, keeping your values` : 'Enter edits again, to save your values as a new line';
    case 'delete':
      return stale !== null ? 'Enter does nothing · Edit again first' : `Enter deletes line ${check.line}`;
  }
  if (stale !== null) return 'Enter does nothing · Edit again first';
  if (check.takenBy !== null) return `Enter does nothing · Line ${check.takenBy.line} already has this name.`;
  if (check.problem !== null) return `Enter does nothing · ${fieldProblemText(check.problem, check.line, fields.url)}`;
  return anchor === null ? `Enter saves it as line ${check.line}` : `Enter saves line ${check.line}`;
}

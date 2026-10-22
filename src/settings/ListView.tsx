// The List view (In use, "Edit the list"; F14, G12 to G16, G21, G31, G32, L2, T1; Composition, "Settings
// views"): the stored document line by line, in document order with its own line numbers: each mapping with
// its name, URL, and note, each heading (F14) as one section heading, and each line the extension cannot read
// as an unreadable row with its raw text, why, and *Fix in text*, which shows the host's Text view on that line
// (G16); blank lines are not listed. A mapping row's pencil opens the row editor in the row's place, one at a
// time, with the line as this view's read holds it, offering *Move up* and *Move down*, and in the popup *Copy
// tab URL* above its fields; no storage change moves or closes an open editor. A change it stores is confirmed
// in the list beside its line, with Undo, itself undoable (G15); after a move, and its Undo, the editor stays
// open on the moved line. *Add mapping*, a plus in the host's header, opens the Name form with no page (G11) at
// the top of the view, one form or editor open at a time, its insert confirmed as an edit is. The document is
// read as the view opens and after every change to it (State), and every line is rendered (T1). The view writes
// only through the editor's, the form's, and Undo's requests (R1), and nothing in it opens a URL (G4, R4). What
// differs by host comes in as `showTextView`, how the Text view is shown, `headerControls`, the header's place
// for *Add mapping*, and `openerTab`, which the form's and the editor's *Copy tab URL* copy in the popup alone.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type RefObject } from 'react';
import type { Anchor } from '../document/anchor';
import { Confirmation, useConfirmationLifetime, useUndo } from '../line-changes/Confirmation';
import { lineMoved, offersUndo, type Confirmed, type Outcome } from '../line-changes/outcomes';
import { Pencil } from '../line-changes/Pencil';
import { RowEditor } from '../line-changes/RowEditor';
import { chromeMessage } from '../requests';
import { readMappings } from '../stored-document';
import { AddMapping } from './AddMapping';
import { CopyTabUrl } from './CopyTabUrl';
import { confirmationPlace, editorPlace, listEntries, listItems, whatEnterDoes, type ListEntry, type ListItem, type MappingItem, type Place, type RowControl } from './list-view';
import type { SettingsViewProps } from './settings-view';
import { errorText } from './TextErrors';
import './settings.css';
import './list-view.css';

/** Where a confirmation stands before there has been one. */
const TOP: Place = { kind: 'before', line: 1 };

/** The open editor: which opening it is, so each opening is a fresh editor, and the line as this view's read held it. */
interface OpenEditor {
  opened: number;
  anchor: Anchor;
}

/**
 * Where the focus goes once the next change is drawn: the confirmation's Undo, or the control of a line's row;
 * `meanwhile`, the control it went to while that row was not yet drawn, as a line a change added before the
 * read that lists it.
 */
interface FocusRequest {
  to: 'undo' | { line: number };
  meanwhile?: Element;
}

/** A row's control with the focus, by the row's key, its line as it was then: lines above it may come and go since. */
type FocusedRow = RowControl & { key: string };

export function ListView({ sayWhatEnterDoes, showTextView, headerControls, openerTab }: SettingsViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const { stored, unread } = useStoredDocument();
  const [editor, setEditor] = useState<OpenEditor | null>(null);
  // Whether *Add mapping*'s Name form is open; an editor and the form are never open together.
  const [adding, setAdding] = useState(false);
  // While the editor's or the form's change awaits its reply, every other edit waits, so the reply lands on what sent it (G21).
  const [waiting, setWaiting] = useState(false);
  const [editorSays, setEditorSays] = useState('Enter does nothing');
  const [focused, setFocused] = useState<FocusedRow | 'undo' | 'add' | 'copy' | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<Place>(TOP);
  const count = useRef(0);
  const own = useRef<HTMLDivElement>(null);

  const items = useMemo(() => (stored === undefined ? [] : listItems(stored)), [stored]);
  const place = useMemo(() => (editor === null || stored === undefined ? null : editorPlace(stored, editor.anchor)), [editor, stored]);
  const entries = useMemo(
    () => listEntries(items, editor === null || place === null ? null : { key: `editor ${editor.opened}`, place }, confirmed === null ? null : confirmedAt),
    [items, editor, place, confirmed === null, confirmedAt],
  );
  const focus = useFocusKeeping(root, own, entries, confirmed, () => setFocused(null));
  const revealMove = useMoveRevealing(own, place);

  const endConfirmation = useCallback((id: number) => setConfirmed((shown) => (shown?.id === id ? null : shown)), []);
  useConfirmationLifetime(confirmed, endConfirmation, own);
  // `sentFrom`: the opening of the editor open as the change was sent. A move, or its Undo, keeps that editor
  // open on the line it left, and never moves an editor opened since onto that line (G13).
  const confirm = (outcome: Outcome, sentFrom: number | undefined) => {
    count.current += 1;
    setConfirmed({ id: count.current, outcome });
    setConfirmedAt((shown) => confirmationPlace(outcome, shown));
    if (outcome.kind !== 'refused') focus.line.current = outcome.line;
    if (outcome.kind === 'moved' || outcome.kind === 'moved-back') setEditor((open) => (open !== null && open.opened === sentFrom ? { ...open, anchor: lineMoved(outcome) } : open));
  };
  // Undo's outcome lands after its request, through the callback of the render whose Undo sent it: `editor` is the one open then.
  const { undo, undoing } = useUndo(confirmed, (outcome) => confirm(outcome, editor?.opened));

  // Opening an editor or the Name form is the user's next action: the confirmation and its Undo end (G15), and
  // either closes the other, storing nothing. An editor's line is the row's, number and exact text, from the
  // read this view rendered, which no later read moves (G13).
  const openEditor = (anchor: Anchor) => {
    count.current += 1;
    focus.line.current = anchor.line;
    setConfirmed(null);
    // The editor says what Enter does in it; the pencil that opened it goes without a blur.
    setFocused(null);
    setAdding(false);
    setEditor({ opened: count.current, anchor });
  };
  const openForm = () => {
    setConfirmed(null);
    setFocused(null);
    setEditor(null);
    setAdding(true);
  };
  const actions = useLatest({
    edit: (item) => {
      if (!waiting) openEditor({ line: item.line, text: item.text });
    },
    fix: (line) => {
      if (!waiting) showTextView?.(line);
    },
    focusRow: (control) => {
      if (control !== null) focus.line.current = control.line;
      setFocused(control);
    },
    // A change the editor or the form stored shows its confirmation and closes them; the focus goes to the
    // changed row's pencil, or, for a removed line, to Undo, never to nothing (G32). A move keeps the editor open
    // on its line, the focus on the control that moved it, so the next move needs no reopening.
    stored: (outcome) => {
      // Every other edit waits while the editor's change awaits its reply: the editor open now sent it.
      confirm(outcome, editor?.opened);
      if (outcome.kind === 'moved') return revealMove(outcome.line);
      setEditor(null);
      setAdding(false);
      focus.ask(outcome.kind === 'removed' ? 'undo' : { line: focus.line.current });
    },
    editInstead: openEditor,
    closeEditor: () => {
      focus.ask({ line: place?.line ?? focus.line.current });
      setEditor(null);
    },
    add: () => {
      if (!waiting) openForm();
    },
    // Cancel: the form gives the focus back to *Add mapping*.
    closeForm: () => setAdding(false),
    addFocus: setFocused,
    copyFocus: (on) => setFocused(on ? 'copy' : null),
    editorSays: setEditorSays,
    busy: setWaiting,
    // Typing into the editor or the form is the user's next action: a confirmation shown with it ends (G15).
    typed: () => {
      if (confirmed !== null) setConfirmed(null);
    },
    undo: () => void undo(),
    undoFocus: (on) => setFocused(on ? 'undo' : null),
  });

  // The footer names the focused row's line as now read (L2).
  const focusedNow = focused === null || typeof focused === 'string' ? focused : lineNow(items, focused);
  const enter = whatEnterDoes(focusedNow, { confirmed, undoing, waiting, adding, editorSays: editor === null && !adding ? null : editorSays });
  useEffect(() => sayWhatEnterDoes?.(enter), [enter, sayWhatEnterDoes]);

  const addMapping = stored !== undefined && (
    <AddMapping
      document={stored}
      open={adding}
      header={headerControls}
      openerTab={openerTab}
      waiting={waiting}
      onOpen={actions.add}
      onSaved={actions.stored}
      onEditInstead={actions.editInstead}
      onCancel={actions.closeForm}
      onBusy={actions.busy}
      onTyped={actions.typed}
      sayWhatEnterDoes={actions.editorSays}
      onFocusChange={actions.addFocus}
    />
  );

  return (
    <div className="list-view" ref={root} {...focus.watch}>
      {unread !== null && (
        <p className="settings-alert" role="alert">
          The document could not be read. Chrome said: {unread}
        </p>
      )}
      {/* At the top, below the header whose plus opens it. */}
      {addMapping}
      {stored !== undefined && !items.some((item) => item.kind === 'mapping') && <p className="settings-text">The document has no mappings.</p>}
      {entries.length > 0 && (
        <ListLines
          entries={entries}
          stored={stored ?? ''}
          editor={editor}
          offersTabUrl={openerTab !== undefined}
          tabUrl={openerTab?.url}
          confirmed={confirmed}
          own={own}
          undoing={undoing}
          waiting={waiting}
          actions={actions}
        />
      )}
    </div>
  );
}

/** The stored document as last read, read as the view opens and after every change to it (State); undefined until the first read lands. */
function useStoredDocument() {
  const [stored, setStored] = useState<string>();
  // What Chrome said when the last read failed, until one succeeds; the rows of the last read stay.
  const [unread, setUnread] = useState<string | null>(null);
  useEffect(() => {
    let open = true;
    // Every read asks again, and Chrome answers reads in the order they were made, so the last shows the latest.
    const read = () =>
      chrome.storage.local.get('mappings').then(
        ({ mappings }) => {
          if (!open) return;
          setStored(readMappings(mappings));
          setUnread(null);
        },
        (error: unknown) => {
          if (open) setUnread(chromeMessage(error));
        },
      );
    const changed = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && 'mappings' in changes) void read();
    };
    chrome.storage.onChanged.addListener(changed);
    void read();
    return () => {
      open = false;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, []);
  return { stored, unread };
}

/**
 * Where the focus goes as the list is drawn (G32): where a change asked (`ask`), once it is drawn; else, when the
 * control that had it went (a pencil with its row, *Fix in text*, Undo with its confirmation or for a refusal,
 * the editor), the view's control nearest `line`, the line it was last at; else the control that kept it stays
 * in view. Keyed to what can go, not run on every render: the accessibility pass blurs each control on purpose.
 * `onMoved` is called as it moves the focus, since a control that went took no blur with it.
 */
function useFocusKeeping(root: RefObject<HTMLElement | null>, own: RefObject<HTMLElement | null>, entries: readonly ListEntry[], confirmed: Confirmed | null, onMoved: () => void) {
  const request = useRef<FocusRequest | null>(null);
  const line = useRef(1);
  // Whether the focus was last inside the view, so a control of the view that goes gives it back there.
  const held = useRef(false);
  useLayoutEffect(() => {
    const view = root.current;
    const asked = request.current;
    request.current = null;
    if (view === null) return;
    const active = document.activeElement;
    // A row control that keeps the focus has the line it is now drawn at.
    const row = active?.closest<HTMLElement>('li[data-line]');
    if (row !== null && row !== undefined && view.contains(row)) line.current = Number(row.dataset.line);
    const lost = held.current && active === document.body;
    // A request still waiting for its row is due while the focus stays where it went meanwhile.
    const due = asked !== null && (asked.meanwhile === undefined || active === asked.meanwhile || active === document.body);
    if (!due && !lost) {
      // The control that keeps the focus stays in view as lines around it come and go (G32).
      if (active instanceof HTMLElement && view.contains(active)) active.scrollIntoView({ block: 'nearest' });
      return;
    }
    const to = due ? asked.to : { line: line.current };
    let target = to === 'undo' && offersUndo(confirmed) ? (own.current?.querySelector<HTMLElement>('button') ?? undefined) : undefined;
    if (target === undefined) {
      const at = to === 'undo' ? line.current : to.line;
      target = rowControl(view, at) ?? undefined;
      if (target === undefined) {
        target = nearestControl(view, at, own.current);
        // Once: the read that lists a line the change added is the next one.
        if (due && asked.meanwhile === undefined && target !== undefined) request.current = { to, meanwhile: target };
      }
    }
    if (target !== undefined && target !== active) {
      onMoved();
      target.focus();
    }
    // Its Undo in view after the change, beside the row that has the focus (G15).
    if (due && asked.meanwhile === undefined) own.current?.scrollIntoView({ block: 'nearest' });
  }, [entries, confirmed]);
  return {
    line,
    ask: (to: FocusRequest['to']) => (request.current = { to }),
    watch: {
      onFocus: () => (held.current = true),
      onBlur: (event: FocusEvent) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) held.current = false;
      },
    },
  };
}

/**
 * Brings a move's confirmation into view below the editor once the read lists the moved line where the move
 * put it (`place`, the editor's), the focus staying, in view, on the control that moved it (G15, G32).
 */
function useMoveRevealing(own: RefObject<HTMLElement | null>, place: Place | null) {
  const due = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (due.current === null || place?.line !== due.current) return;
    due.current = null;
    own.current?.scrollIntoView({ block: 'nearest' });
    if (document.activeElement instanceof HTMLElement) document.activeElement.scrollIntoView({ block: 'nearest' });
  }, [own, place]);
  return (line: number) => {
    due.current = line;
  };
}

/** What the list's rows, editor, confirmation, and *Add mapping* call. */
interface ListActions {
  edit(item: MappingItem): void;
  fix(line: number): void;
  focusRow(control: FocusedRow | null): void;
  stored(outcome: Outcome): void;
  editInstead(anchor: Anchor): void;
  closeEditor(): void;
  add(): void;
  closeForm(): void;
  addFocus(on: 'add' | 'copy' | null): void;
  /** Called with true as the editor's *Copy tab URL* gains the focus and with false as it loses it. */
  copyFocus(on: boolean): void;
  editorSays(text: string): void;
  busy(busy: boolean): void;
  typed(): void;
  undo(): void;
  undoFocus(on: boolean): void;
}

/** `actions` as one object that is the same on every render and calls the latest of each, so the list is drawn again only when what it shows changes. */
function useLatest(actions: ListActions): ListActions {
  const latest = useRef(actions);
  latest.current = actions;
  return useMemo(
    () => ({
      edit: (item) => latest.current.edit(item),
      fix: (line) => latest.current.fix(line),
      focusRow: (control) => latest.current.focusRow(control),
      stored: (outcome) => latest.current.stored(outcome),
      editInstead: (anchor) => latest.current.editInstead(anchor),
      closeEditor: () => latest.current.closeEditor(),
      add: () => latest.current.add(),
      closeForm: () => latest.current.closeForm(),
      addFocus: (on) => latest.current.addFocus(on),
      copyFocus: (on) => latest.current.copyFocus(on),
      editorSays: (text) => latest.current.editorSays(text),
      busy: (busy) => latest.current.busy(busy),
      typed: () => latest.current.typed(),
      undo: () => latest.current.undo(),
      undoFocus: (on) => latest.current.undoFocus(on),
    }),
    [],
  );
}

interface ListLinesProps {
  entries: readonly ListEntry[];
  stored: string;
  editor: OpenEditor | null;
  /** Whether the editor offers *Copy tab URL*, in the popup alone, and the opener tab's address it copies, undefined when Chrome granted none: apart, so the list is not drawn again for a new `openerTab` object. */
  offersTabUrl: boolean;
  tabUrl: string | undefined;
  confirmed: Confirmed | null;
  own: RefObject<HTMLDivElement | null>;
  undoing: boolean;
  waiting: boolean;
  actions: ListActions;
}

/**
 * The list: every entry an item of one `ul`, never a listbox (G32). Drawn again only when what it shows changes,
 * not as the focus moves or the footer changes, which at ten thousand rows would take a quarter of a second each (T1).
 */
const ListLines = memo(function ListLines({ entries, stored, editor, offersTabUrl, tabUrl, confirmed, own, undoing, waiting, actions }: ListLinesProps) {
  const nameField = useRef<HTMLInputElement>(null);
  return (
    <ul className="list-lines" aria-label="Document lines">
      {entries.map((entry) => {
        switch (entry.kind) {
          case 'editor':
            return (
              <li key={entry.key} className="list-editor" onInput={actions.typed}>
                {/* Above the fields, as in the Add mapping form, for a URL to paste over the line's own. */}
                {offersTabUrl && (
                  <div className="settings-action list-editor-copy">
                    <CopyTabUrl url={tabUrl} onFocusChange={actions.copyFocus} />
                  </div>
                )}
                <RowEditor
                  document={stored}
                  anchor={editor!.anchor}
                  start={nameField}
                  offersMoves
                  onStored={actions.stored}
                  onEditInstead={actions.editInstead}
                  onBack={actions.closeEditor}
                  sayWhatEnterDoes={actions.editorSays}
                  onBusy={actions.busy}
                />
              </li>
            );
          case 'confirmation':
            return (
              <li key={entry.key} className="list-confirmation">
                {/* A character typed on Undo has nowhere to go in this view. */}
                <Confirmation confirmed={confirmed!} own={own} undoing={undoing} onUndo={actions.undo} onUndoFocus={actions.undoFocus} onTyping={() => {}} />
              </li>
            );
          case 'heading':
            return <HeadingRow key={entry.key} item={entry} />;
          case 'mapping':
            return <MappingRow key={entry.key} item={entry} waiting={waiting} onEdit={actions.edit} onFocus={actions.focusRow} />;
          case 'unreadable':
            return <UnreadableRow key={entry.key} item={entry} waiting={waiting} onFix={actions.fix} onFocus={actions.focusRow} />;
        }
      })}
    </ul>
  );
});

const HeadingRow = memo(function HeadingRow({ item }: { item: Extract<ListItem, { kind: 'heading' }> }) {
  return (
    <li className="list-heading">
      <h2 className="list-heading-text">{item.name}</h2>
    </li>
  );
});

interface MappingRowProps {
  item: MappingItem;
  waiting: boolean;
  onEdit(item: MappingItem): void;
  onFocus(control: FocusedRow | null): void;
}

/** A mapping's row: its line number, name, URL, and note, each cut with an ellipsis from its start when longer than the row (G7), and its pencil. */
const MappingRow = memo(function MappingRow({ item, waiting, onEdit, onFocus }: MappingRowProps) {
  const { name, url, note } = item.mapping;
  return (
    <li className="list-row" data-line={item.line}>
      <span className="list-number">{item.line}</span>
      <span className="list-text">
        {/* Its own direction, from its first letter, so a right-to-left name is cut at its end, not its start. */}
        <span className="list-name" dir="auto">
          {name}
        </span>
        <span className="list-url">{url}</span>
        {note !== null && note !== '' && (
          <span className="list-note" dir="auto">
            {note}
          </span>
        )}
      </span>
      <Pencil name={name} waiting={waiting} onEdit={() => onEdit(item)} onFocusChange={(on) => onFocus(on ? { control: 'pencil', line: item.line, key: item.key } : null)} />
    </li>
  );
});

interface UnreadableRowProps {
  item: Extract<ListItem, { kind: 'unreadable' }>;
  waiting: boolean;
  onFix(line: number): void;
  onFocus(control: FocusedRow | null): void;
}

/** A line the extension cannot read (G16): its raw text whole, its spaces and tabs as written, why, and *Fix in text* alone. */
const UnreadableRow = memo(function UnreadableRow({ item, waiting, onFix, onFocus }: UnreadableRowProps) {
  return (
    <li className="list-row unreadable" data-line={item.line}>
      <span className="list-number">{item.line}</span>
      <span className="list-text">
        <span className="list-raw">{item.text}</span>
        <span className="list-problem">{errorText(item.error)}</span>
      </span>
      <button
        type="button"
        className="settings-button list-fix"
        aria-disabled={waiting}
        onClick={() => onFix(item.line)}
        onFocus={() => onFocus({ control: 'fix', line: item.line, key: item.key })}
        onBlur={() => onFocus(null)}
      >
        Fix in text
      </button>
    </li>
  );
});

/** `focused` with its row's line as `items` now list it; null once no row has its key. */
function lineNow(items: readonly ListItem[], focused: FocusedRow): RowControl | null {
  const item = items.find((each) => each.key === focused.key);
  return item === undefined ? null : { control: focused.control, line: item.line };
}

/** The control of the row of `line` in `view`, a pencil or *Fix in text*; null while no row lists that line. */
function rowControl(view: HTMLElement, line: number): HTMLElement | null {
  return view.querySelector<HTMLElement>(`li[data-line="${line}"] button`);
}

/**
 * The row control nearest `line` in `view`, at it or above, else the first; with none, Undo while it is
 * offered, else the control just before the view, where Shift+Tab from it would go.
 */
function nearestControl(view: HTMLElement, line: number, confirmation: HTMLElement | null): HTMLElement | undefined {
  const rows = [...view.querySelectorAll<HTMLElement>('li[data-line]')];
  const row = rows.filter((each) => Number(each.dataset.line) <= line).at(-1) ?? rows[0];
  return row?.querySelector<HTMLElement>('button') ?? confirmation?.querySelector<HTMLElement>('button') ?? controlBefore(view);
}

function controlBefore(view: HTMLElement): HTMLElement | undefined {
  const controls = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')];
  return controls.filter((control) => control.tabIndex >= 0 && view.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_PRECEDING).at(-1);
}

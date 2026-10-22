// The popup (In use, "Jump", "Name this page", "Name from a search", "Name a link", "Edit from a suggestion",
// "First run"): search, with the search box, the mode chip, the *Name this page* plus, and the gear, the
// confirmation of the last change with its Undo, the list seven rows at a time with a cue for the rest and each
// listed mapping's pencil, and what the page is called (G10) with its pencil; the Name form, also opened for a
// command or a menu item that asked for it; a row's editor, opened by a pencil, by Ctrl+E on the selected row
// (P1), or from the Name form; the settings, opened by the gear (G31); or, while the document is empty, the
// first-run state in search's place (G30). After an update from 1.x, search, the first run, the Name form, and
// the editor show the notice of what is new (G25). A footer says what Enter does. Everything shown derives
// from storage, read when the popup opens and again after every change; a mapping opens only through the
// worker's jump, sent from the popup's Enter handler or a row's click handler (R4), never from anything else.
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type MouseEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { flushSync } from 'react-dom';
import { anchorAt } from '../document/anchor';
import { isEmptyDocument } from '../document/example';
import { readDocument } from '../document/grammar';
import { mappingOfPage } from '../document/page-mapping';
import type { SearchRow } from '../document/search';
import { PlusIcon } from '../icons';
import { intentFor, startMode, type OpenIntent, type OpenMode } from '../open-intent';
import { applyTheme, readPopupSettingsView, readSearchOrder, readTheme } from '../preferences';
import { send } from '../requests';
import { readMappings, readUsage } from '../stored-document';
import { Confirmation, useConfirmationLifetime, useUndo } from '../line-changes/Confirmation';
import { useFieldLine } from '../line-changes/field-line';
import type { NameSubject } from '../line-changes/NameForm';
import { offersUndo, undoFooter } from '../line-changes/outcomes';
import { ThisPage } from '../line-changes/ThisPage';
import { FirstRun } from './FirstRun';
import { outsideWindow, WINDOW_ROWS } from './list-state';
import { editControlsOf, editedLine, footer, initialState, isEditKey, jumpRequest, MODE_LABEL, notOpened, otherMode, reduce, type Opener, type Stored } from './popup-state';
import { PopupNameForm } from './PopupNameForm';
import { PopupRowEditor } from './PopupRowEditor';
import { PopupSettings, SettingsGear } from './PopupSettings';
import { Row, rowId, type MappingRow } from './Row';
import { RowPencils } from './RowPencils';
import { useSelectionInView } from './selection-in-view';
import { useFitToViewport } from './fit-to-viewport';
import { footerWithNotice } from './upgrade-notice';
import { UpgradeNotice, useUpgradeNotice } from './UpgradeNotice';

const STORED_KEYS = ['mappings', 'usage', 'searchOrder', 'themePref', 'popupSettingsView', 'upgradeNotice'];
// Pixels of wheel movement that move the window by one row.
const WHEEL_ROW_PIXELS = 40;

export function Popup() {
  const [state, dispatch] = useReducer(reduce, undefined, initialState);
  const wheel = useRef(0);
  const searchBox = useRef<HTMLInputElement>(null);
  // Sized before the popup fits itself to the viewport, which then measures the search bar as its text grew it (G7).
  useFieldLine(searchBox);
  const layout = useFitToViewport();
  // Shown, and acted on, only while its row is visible in search's view (G3).
  const selection = useSelectionInView(layout.view, state.list.selected, searchBox);
  const namePage = useRef<HTMLButtonElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const endConfirmation = useCallback((id: number) => dispatch({ kind: 'confirmation-ended', id }), []);
  useConfirmationLifetime(state.confirmed, endConfirmation, confirmation);
  const { undo, undoing } = useUndo(state.confirmed, (outcome) => dispatch({ kind: 'undone', outcome }));

  const ready = state.stored !== undefined && state.opener !== undefined;
  // Shown only once the popup knows whether it opened for the Name form, so keys typed until then go to the search box.
  const firstRun = ready && state.view.kind === 'search' && isEmptyDocument(state.stored!.document);
  // Shown once the popup is ready, as the first run is: until then Enter does nothing, as the footer says.
  const notice = useUpgradeNotice(ready && state.stored!.upgradeNotice);

  useEffect(() => {
    // Every read asks for the keys again, and Chrome answers reads in the order they were made, so the last
    // answer shows the latest change, whenever its event arrived. Drawn before the next key arrives (flushSync),
    // so a Name form these open has the keyboard from then on.
    const read = () =>
      chrome.storage.local.get(STORED_KEYS).then((items) => flushSync(() => dispatch({ kind: 'stored', stored: readStored(items), now: Date.now() })));
    const changed = (_changes: unknown, area: string) => {
      if (area === 'local') void read();
    };
    chrome.storage.onChanged.addListener(changed);
    void read();
    void findOpener().then((opener) => flushSync(() => dispatch({ kind: 'opener', opener, now: Date.now() })));
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);

  const theme = state.stored?.theme ?? 'system';
  useEffect(() => applyTheme(theme), [theme]);

  // Up, Down, and every new list bring the selected row into view (G3), as do a message above the rows pushing
  // them down and search shown again after the Name form; a storage change that leaves the rows as they were
  // moves nothing, nor does anything here answer the view's own scroll (G7, G32).
  useLayoutEffect(() => selection.bringIntoView(), [state.selections, state.list.selected, state.list.top, state.message, state.confirmed, state.view]);

  const other = otherMode(state.mode);

  const jump = async (row: MappingRow, mode: OpenMode) => {
    if (!ready) return;
    const request = jumpRequest(row, mode, state.opener);
    if (request === undefined) {
      dispatch({ kind: 'message', message: 'Not opened: Chrome did not say which tab this popup was opened on.' });
      return;
    }
    dispatch({ kind: 'message', message: null });
    const reply = await send(request);
    if (reply.kind === 'opened') window.close();
    else dispatch({ kind: 'message', message: notOpened(reply) });
  };

  // The Name form opens only once the popup knows the document and the page it names.
  const openForm = (name: string) => {
    if (ready) dispatch({ kind: 'name', name });
  };
  // Settings open, like the form, only once the popup knows whether its opening asked for the form instead.
  const openSettings = () => {
    if (ready) dispatch({ kind: 'settings' });
  };
  // The Name row opens the form with its text, whatever the mode (G4); every other row opens its mapping.
  const act = (row: SearchRow, mode: OpenMode) => (row.group === 'name' ? openForm(row.name) : void jump(row, mode));
  // The one way a line's editor opens: on `line` as the read this popup shows holds it, its number and exact
  // text from that one read, which no later read moves (G13); with the argument row's argument, else none.
  const openEditor = (line: number, argument: string | null) => {
    const anchor = ready ? anchorAt(state.stored!.document, line) : undefined;
    if (anchor !== undefined) dispatch({ kind: 'edit', anchor, argument });
  };

  // Search's keys, wherever the focus is (the search box, the view when Chrome lets it take focus to scroll,
  // or nothing), so the footer is true for all of them; on a button, Enter and Space activate it instead, but
  // Up and Down move the selection and Ctrl+E edits the selected row from there too (G3, P1). In the first
  // run, Enter starts *Name this page* (G30).
  // The Name form and the editor have their own Enter, and settings have their controls'; Escape closes the
  // popup from every view.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => {});
  onKey.current = (event: KeyboardEvent) => {
    // A key that ends an input method's composition belongs to the composition.
    if (event.isComposing) return;
    if (event.key === 'Escape') window.close();
    else if (state.view.kind !== 'search') return;
    else if (isEditKey(event)) {
      // Taken from Chrome, which would act on it, whether or not a row can be edited.
      event.preventDefault();
      const acted = firstRun ? null : selection.actedOn();
      const selected = acted === null ? undefined : state.list.rows[acted];
      if (selected !== undefined && selected.group !== 'name') openEditor(selected.mapping.line, selected.group === 'argument' ? selected.argument : null);
    } else if (!firstRun && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      // On a button too, which has no use for them: Up and Down move the selection wherever the focus is (G3),
      // not the view, which Chrome would scroll for them on a pencil.
      event.preventDefault();
      dispatch({ kind: 'move', step: event.key === 'ArrowDown' ? 1 : -1 });
    } else if (event.target instanceof Element && event.target.closest('button')) return;
    else if (firstRun) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      openForm('');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const acted = selection.actedOn();
      const selected = acted === null ? undefined : state.list.rows[acted];
      if (selected) act(selected, event.shiftKey ? other : state.mode);
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  const onRowClick = (row: SearchRow, event: MouseEvent) => act(row, event.shiftKey ? other : state.mode);

  const onWheel = (event: ReactWheelEvent) => {
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * WHEEL_ROW_PIXELS;
    wheel.current += event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? pixels * WINDOW_ROWS : pixels;
    const rows = Math.trunc(wheel.current / WHEEL_ROW_PIXELS);
    if (rows === 0) return;
    wheel.current -= rows * WHEEL_ROW_PIXELS;
    dispatch({ kind: 'scroll', rows });
  };

  const storedDocument = state.stored?.document;
  const pageUrl = state.opener?.url;
  const thisPage = useMemo(
    () => (storedDocument === undefined || pageUrl === undefined ? undefined : mappingOfPage(readDocument(storedDocument).mappings, pageUrl)),
    [storedDocument, pageUrl],
  );
  const { list } = state;
  const shown = list.rows.slice(list.top, list.top + WINDOW_ROWS);

  // Focus taken away with what held it gives it to the view's first control instead of to nothing (G32): Undo
  // going with its confirmation or for a refusal; a pencil going with its row, as the window moves or another
  // window's change takes its mapping (E1), or *This page is*'s with that mapping; or the view switching
  // between search and the first run. An Undo still offered there takes it back, also from the search box,
  // which takes the focus as search is drawn again, so the footer's word for Undo stays true (L2). Keyed to
  // what can go, not run on every render: the accessibility pass blurs each control on purpose.
  const editControls = state.view.kind === 'search' ? editControlsOf(shown, thisPage) : '';
  useLayoutEffect(() => {
    if (state.focused === 'undo' && offersUndo(state.confirmed)) confirmation.current?.querySelector('button')?.focus();
    else if (document.activeElement === document.body) {
      (firstRun ? namePage : searchBox).current?.focus();
      if (typeof state.focused === 'object' && state.focused !== null) dispatch({ kind: 'focused', focused: null });
    }
  }, [state.confirmed, firstRun, editControls]);

  if (state.view.kind === 'name' && state.stored !== undefined) {
    return (
      <PopupNameForm
        key={state.view.opened}
        document={state.stored.document}
        name={state.view.name}
        subject={state.view.subject}
        notice={notice}
        onSaved={(outcome) => dispatch({ kind: 'changed', outcome, now: Date.now() })}
        onEdit={(line) => openEditor(line, null)}
        onCancel={() => dispatch({ kind: 'cancel' })}
      />
    );
  }

  if (state.view.kind === 'editor' && state.stored !== undefined) {
    return (
      <PopupRowEditor
        key={state.view.opened}
        document={state.stored.document}
        anchor={state.view.anchor}
        argument={state.view.argument}
        tabUrl={state.opener?.url}
        notice={notice}
        onStored={(outcome) => dispatch({ kind: 'changed', outcome, now: Date.now() })}
        onEditInstead={(anchor) => dispatch({ kind: 'edit', anchor, argument: null })}
        // Back to search as it was left: the typed text, the window, the selection, and the chip's mode.
        onBack={() => dispatch({ kind: 'cancel' })}
      />
    );
  }

  // Back to search as it was left, its list redrawn for any change made meanwhile (G27).
  if (state.view.kind === 'settings') return <PopupSettings tabUrl={state.opener?.url} opensOn={state.stored!.popupSettingsView} onBack={() => dispatch({ kind: 'cancel' })} />;

  const shownConfirmation = state.confirmed !== null && (
    <Confirmation
      confirmed={state.confirmed}
      own={confirmation}
      undoing={undoing}
      onUndo={() => void undo()}
      onUndoFocus={(focused) => dispatch({ kind: 'focused', focused: focused ? 'undo' : null })}
      onTyping={() => searchBox.current?.focus()}
    />
  );

  if (firstRun) {
    return (
      <FirstRun
        ready={ready}
        confirmation={shownConfirmation}
        undoFooter={state.focused === 'undo' && state.confirmed !== null ? undoFooter(state.confirmed.outcome, undoing) : undefined}
        message={state.message}
        notice={notice}
        namePage={namePage}
        onNamePage={() => openForm('')}
        onSettings={openSettings}
        onMessage={(message) => dispatch({ kind: 'message', message })}
      />
    );
  }

  const { above, below } = outsideWindow(list);
  const onEditFocus = (key: string | null) => dispatch({ kind: 'focused', focused: key === null ? null : { edit: key } });
  const editKey = typeof state.focused === 'object' && state.focused !== null ? state.focused.edit : undefined;
  const editLine = editKey === undefined ? undefined : editedLine(editKey, shown, thisPage);
  const cue = [above > 0 ? `${above} more above` : '', below > 0 ? `${below} more below` : ''].filter(Boolean).join(' · ');

  return (
    <main className="popup" ref={layout.root}>
      <header className="search-bar">
        <input
          ref={searchBox}
          className="search-box"
          type="text"
          role="combobox"
          aria-label="Search mappings by name or address"
          aria-autocomplete="list"
          aria-expanded={list.rows.length > 0}
          aria-controls={list.rows.length > 0 ? 'rows' : undefined}
          aria-activedescendant={selection.shown === null ? undefined : rowId(selection.shown)}
          placeholder="Type a name"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={state.typed}
          onChange={(event) => dispatch({ kind: 'typed', typed: event.target.value, now: Date.now() })}
          // Back in the search box, the selection is in view and Enter acts on it (G3), also after the focus went
          // to a control the view scrolled to, as the pencil after a long name of the page.
          onFocus={selection.bringIntoView}
        />
        <button
          type="button"
          className="chip"
          aria-label={`${MODE_LABEL[state.mode]} mode; activate to switch to ${MODE_LABEL[other]}`}
          // A click flips the chip and leaves the typing in the search box.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => dispatch({ kind: 'flip' })}
          onFocus={() => dispatch({ kind: 'focused', focused: 'chip' })}
          onBlur={() => dispatch({ kind: 'focused', focused: null })}
        >
          {MODE_LABEL[state.mode]}
        </button>
        {/* In the header, so it stays in one place however many rows are listed. */}
        <button
          type="button"
          className="icon-button name-page"
          aria-label="Name this page"
          title="Name this page"
          onClick={() => openForm('')}
          onFocus={() => dispatch({ kind: 'focused', focused: 'name-page' })}
          onBlur={() => dispatch({ kind: 'focused', focused: null })}
        >
          <PlusIcon />
        </button>
        <SettingsGear onClick={openSettings} onFocusChange={(focused) => dispatch({ kind: 'focused', focused: focused ? 'settings' : null })} />
      </header>
      <UpgradeNotice notice={notice} start={searchBox} />
      <div className="view" ref={layout.view} role="region" aria-label="Search results">
        <div className="view-content" ref={layout.content}>
          {shownConfirmation}
          {state.message !== null && (
            <p className="message" role="alert">
              {state.message}
            </p>
          )}
          {list.rows.length > 0 && (
            <div className="rows-area" onWheel={onWheel}>
              {/* Pressing a row keeps the focus, and with it the typing, in the search box. */}
              <ul id="rows" className="rows" role="listbox" aria-label="Mappings" onMouseDown={(event) => event.preventDefault()}>
                {shown.map((row, i) => (
                  <Row
                    key={list.top + i}
                    row={row}
                    index={list.top + i}
                    count={list.rows.length}
                    selected={selection.shown === list.top + i}
                    onClick={(event) => onRowClick(row, event)}
                  />
                ))}
              </ul>
              <RowPencils rows={shown} onEdit={openEditor} onFocusChange={onEditFocus} />
            </div>
          )}
          {cue !== '' && <p className="cue">{cue}</p>}
          {/* In the view, which scrolls, since a name may be as long as the document. */}
          {thisPage && <ThisPage key={thisPage.key} mapping={thisPage} onEdit={(line) => openEditor(line, null)} onFocusChange={(focused) => onEditFocus(focused ? thisPage.key : null)} />}
        </div>
      </div>
      <footer className="footer">{footerWithNotice(footer(state, selection.shown, ready, undoing, editLine), notice)}</footer>
    </main>
  );
}

function readStored(items: Record<string, unknown>): Stored {
  const { mappings, usage, searchOrder, themePref, popupSettingsView, upgradeNotice } = items;
  return {
    document: readMappings(mappings),
    order: readSearchOrder(searchOrder),
    usage: readUsage(usage),
    theme: readTheme(themePref),
    popupSettingsView: readPopupSettingsView(popupSettingsView),
    upgradeNotice: upgradeNotice === 'pending',
  };
}

/**
 * The tab the popup was opened on, its start mode, and the Name form its opening asked for: from `openIntent`
 * when it names this window and is fresh, which the popup then removes; a record for another window stays
 * for that window (G5).
 */
async function findOpener(): Promise<Opener> {
  try {
    const [[tab], { openIntent }] = await Promise.all([chrome.tabs.query({ active: true, currentWindow: true }), chrome.storage.local.get('openIntent')]);
    const intent = intentFor(openIntent, tab?.windowId, Date.now());
    // Through the worker, never with a page's own read and removal: a record written between those two calls,
    // for another window, would go too. Awaited, so the popup shows the mode it honored only once no later
    // popup in this window, the toolbar's included, can honor the record again.
    if (intent !== undefined) await send({ kind: 'remove-intent', windowId: intent.windowId, time: intent.time });
    const url = tab?.url || undefined;
    return { tabId: tab?.id, windowId: tab?.windowId, url, title: tab?.title, mode: startMode(intent), asks: askedSubject(intent, url, tab?.title) };
  } catch {
    return { tabId: undefined, windowId: undefined, url: undefined, title: undefined, mode: startMode(undefined), asks: undefined };
  }
}

/** What an honored record asks the Name form to name: the page (F5, G29), or a link on it (G11); nothing for search. */
function askedSubject(intent: OpenIntent | undefined, url: string | undefined, title: string | undefined): NameSubject | undefined {
  if (intent?.kind === 'name-page') return { kind: 'page', url, title };
  if (intent?.kind === 'name-link') return { kind: 'link', url: intent.linkUrl, pageUrl: intent.pageUrl, pageTitle: intent.pageTitle, tabUrl: url };
  return undefined;
}

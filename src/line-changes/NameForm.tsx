// The Name form (In use, "Name this page", "Name a link", "Edit the list"; G8, G9, G10, G11, N6, E5): what the
// page is, or for a link the page it is on, the URL prefilled and editable, or, opened by *Add mapping*, no page
// and an empty URL field; the name, a note, empty to start, written as the line's trailing comment, each field
// with its copy button (G31), the Section choice when the document has headings, and a preview of the exact line
// and where it goes. Every check and the preview come from the document module against the document as last
// read, so they follow every storage change and agree with what the worker writes. Save sends one insert; its
// outcome, which the confirmation shows, is built from the worker's reply alone. A taken name is named, with the
// offer to edit that line instead, beside any other problem (G8); that offer and *This page is*'s pencil (G10)
// leave the form for the editor of that line, the form's values stored nowhere. They, Cancel, and the copy
// buttons wait while Save awaits its reply, so the reply never lands on an editor opened meanwhile or on a form
// gone, where a failure could not be said (G21). It never reads storage or draws its host's frame: the host
// gives it the document as last read and the name field's ref, where the notice of what is new leads (G25), is
// told while Save awaits its reply, and shows what it says Enter does in its footer (L2).
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { readDocument, type Mapping } from '../document/grammar';
import { insertionPoint, insertMapping, type InsertResult } from '../document/insertion';
import { mappingOfPage } from '../document/page-mapping';
import { findSection, headingName, namedSections, type HeadingIdentity, type Section } from '../document/sections';
import { checkMapping } from '../document/validation';
import { send, type InsertReply } from '../requests';
import { editInsteadText, fieldProblemText, refusedValuesText, takenNameText } from './field-problems';
import { copyField, copySays, MappingField, type FieldName, type Said } from './MappingField';
import { insertedOutcome, type Outcome } from './outcomes';
import { SectionChoice, type SectionOption } from './SectionChoice';
import { ThisPage } from './ThisPage';
import './line-form.css';
import './name-form.css';

/**
 * What the form names: the page the popup was opened on, with its address and title when Chrome granted them
 * (E5); or a link, with the address and title of the page it is on as Chrome gave them, and the address of
 * the tab the popup was opened on, which *This page is* follows (G10); or nothing: the form *Add mapping*
 * opens has no page, so no address to start the URL with and no *This page is* (G11).
 */
export type NameSubject =
  | { kind: 'page'; url: string | undefined; title: string | undefined }
  | { kind: 'link'; url: string; pageUrl: string | undefined; pageTitle: string | undefined; tabUrl: string | undefined }
  | { kind: 'none' };

export interface NameFormProps {
  /** The stored document as last read. */
  document: string;
  /** The name to start with: empty, the Name row's typed text, or what was typed before a form a command or menu item asked for showed. */
  name: string;
  subject: NameSubject;
  /** The name field, where the form starts, which a host gives the focus as the notice of what is new does. */
  start: RefObject<HTMLInputElement | null>;
  /** Called with the stored insert's outcome, which the host confirms. */
  onSaved(outcome: Outcome): void;
  /** Opens the editor of line N as the document the form last rendered holds it, leaving the form. */
  onEdit(line: number): void;
  /** Leaves the form, storing nothing; never while Save awaits its reply. */
  onCancel(): void;
  /** What Enter does on Cancel, which leaves for the host's view: `Enter returns to search` in the popup (L2). */
  cancelSays: string;
  /** Called with true as Save is sent and with false as its reply lands, whatever it is, before `onSaved`. */
  onBusy?(busy: boolean): void;
  /** Called with what Enter does where the focus is in the form, as it appears and whenever that changes (L2). */
  sayWhatEnterDoes(text: string): void;
}

/** The controls whose focus changes what Enter does. */
type FormControl = 'cancel' | 'this-page' | 'edit-instead';

export function NameForm({ document: stored, name: startName, subject, start, onSaved, onEdit, onCancel, cancelSays, onBusy, sayWhatEnterDoes }: NameFormProps) {
  const [name, setName] = useState(startName);
  const [url, setUrl] = useState(subject.kind === 'none' ? '' : (subject.url ?? ''));
  const [note, setNote] = useState('');
  // The heading as named when chosen, found again by that identity at every read, never by its position (G9).
  const [heading, setHeading] = useState<HeadingIdentity | null>(null);
  // Why the last save stored nothing, until a value changes.
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  // What the last copy came to, until a value changes or Save is sent.
  const [said, setSaid] = useState<Said | null>(null);
  const [focusedOn, setFocusedOn] = useState<FormControl | null>(null);
  const [copyFocused, setCopyFocused] = useState<FieldName | null>(null);
  const focusOn = (control: FormControl) => (focused: boolean) => setFocusedOn(focused ? control : null);

  const read = useMemo(() => readDocument(stored), [stored]);
  const sections = useMemo(() => namedSections(read.lines), [read]);
  const result = useMemo(() => insertMapping(stored, { name, url, note }, heading), [stored, name, url, note, heading]);
  // The line that has the name, whatever else the values break (G8); `insertMapping` names only the first problem.
  const takenBy = useMemo(() => checkMapping({ name, url, note: '' }, read.mappings).takenBy, [name, url, read]);
  const point = insertionPoint(read.lines, heading);
  const tabUrl = subject.kind === 'link' ? subject.tabUrl : subject.kind === 'page' ? subject.url : undefined;
  const thisPage = tabUrl === undefined ? undefined : mappingOfPage(read.mappings, tabUrl);
  const label = (section: Section) => headingName(read.lines, section.heading);
  const chosen = heading === null ? undefined : findSection(read.lines, heading);
  const options: SectionOption[] = [{ key: 'end', label: 'End of document' }, ...sections.map((section) => ({ key: `${section.heading.first}`, label: label(section) }))];
  const chosenIndex = heading === null ? 0 : chosen === undefined ? null : 1 + sections.findIndex((section) => section.heading.first === chosen.heading.first);
  const problem = result.kind === 'applied' ? null : problemText(result, point.after + 1, url, takenBy);

  const save = async () => {
    if (inFlight.current || result.kind !== 'applied') return;
    inFlight.current = true;
    setSaving(true);
    onBusy?.(true);
    setRefusal(null);
    setSaid(null);
    const reply = await send({ kind: 'insert', name, url, note, heading });
    onBusy?.(false);
    if (reply.kind === 'applied') {
      onSaved(insertedOutcome(reply));
      return;
    }
    inFlight.current = false;
    setSaving(false);
    setRefusal(refusalText(reply, point.after + 1, url));
  };
  // Leaving for the editor waits for Save's reply, which would otherwise close the editor opened meanwhile;
  // leaving the form waits for it too, so a refusal is said where the values still are (G21).
  const edit = (line: number) => {
    if (!inFlight.current) onEdit(line);
  };
  const cancel = () => {
    if (!inFlight.current) onCancel();
  };
  // Inside the click or key handler, which the clipboard needs (S14); it waits for Save's reply, as the form's
  // other actions do.
  const copy = (field: FieldName) => {
    if (!inFlight.current) copyField(field, { name, url, note }[field], setSaid);
  };
  const change = (set: (value: string) => void) => (value: string) => {
    setRefusal(null);
    setSaid(null);
    set(value);
  };

  // The name field has the focus when the form appears, with the caret after a prefilled name.
  useLayoutEffect(() => {
    const field = start.current;
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }, []);

  // Another view's write can remove the last heading and the Section choice with it, free the taken name and
  // the offer to edit its line, or change what this page is called and the pencil beside it: a focus that fell
  // to the page body with one goes to the name field, where the form starts, never to nothing (G32).
  const hasSections = sections.length > 0;
  useLayoutEffect(() => {
    if (document.activeElement !== document.body) return;
    start.current?.focus();
    setFocusedOn(null);
  }, [hasSections, takenBy?.line, thisPage?.key]);

  // Enter saves wherever the focus is but on a button, which Enter activates instead; while Save is blocked
  // it does nothing. It never reaches search's list.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => {});
  onKey.current = (event) => {
    if (event.isComposing || event.key !== 'Enter') return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    event.preventDefault();
    void save();
  };
  useLayoutEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  const where = describeWhere(result, point, chosen ? label(chosen) : undefined);
  // The host's footer is fixed, so this holds no typed or stored text, which can be as long as the document.
  const editsInstead = focusedOn === 'this-page' ? thisPage?.line : focusedOn === 'edit-instead' ? takenBy?.line : undefined;
  const enterSays = saving
    ? 'Saving · Enter does nothing until it is stored'
    : copyFocused !== null
      ? copySays(copyFocused)
      : focusedOn === 'cancel'
        ? cancelSays
        : editsInstead !== undefined
          ? `Enter edits line ${editsInstead} instead`
          : result.kind === 'applied'
            ? `Enter saves it as line ${result.line}`
            : `Enter does nothing · ${result.kind === 'name-taken' ? `Line ${result.line} already has this name.` : fieldProblemText(result, point.after + 1, url)}`;
  // Before the browser paints, so the host's footer never shows its own default in place of the form's.
  useLayoutEffect(() => sayWhatEnterDoes(enterSays), [enterSays, sayWhatEnterDoes]);

  return (
    <form
      className="name-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {subject.kind !== 'none' && (
        <div className="subject">
          {subject.kind === 'link' ? (
            <p className="subject-page">{linkPage(subject)}</p>
          ) : subject.url === undefined ? (
            <p className="subject-missing">Chrome gave no address for this tab: type or paste the URL.</p>
          ) : (
            <>
              {subject.title ? <p className="subject-title">{subject.title}</p> : null}
              {hostOf(subject.url) ? <p className="subject-host">{hostOf(subject.url)}</p> : null}
            </>
          )}
          {thisPage && <ThisPage key={thisPage.key} mapping={thisPage} waiting={saving} onEdit={edit} onFocusChange={focusOn('this-page')} />}
        </div>
      )}
      <MappingField
        field="name"
        value={name}
        invalid={result.kind === 'name-taken' || (result.kind === 'invalid' && result.field === 'name')}
        describedBy="name-form-problem"
        waiting={saving}
        input={start}
        onChange={change(setName)}
        onCopy={copy}
        onCopyFocus={setCopyFocused}
      />
      <MappingField field="url" value={url} invalid={result.kind === 'invalid' && result.field === 'url'} describedBy="name-form-problem" waiting={saving} onChange={change(setUrl)} onCopy={copy} onCopyFocus={setCopyFocused} />
      <MappingField field="note" value={note} invalid={result.kind === 'invalid' && result.field === 'note'} describedBy="name-form-problem" waiting={saving} onChange={change(setNote)} onCopy={copy} onCopyFocus={setCopyFocused} />
      {sections.length > 0 && (
        <SectionChoice
          options={options}
          chosen={chosenIndex}
          onChoose={(index) => {
            setRefusal(null);
            setSaid(null);
            setHeading(index === 0 ? null : sections[index - 1]!.identity);
          }}
        />
      )}
      <div className="preview">
        <p className="preview-where">{where}</p>
        {result.kind === 'applied' && <pre className="preview-line">{result.text}</pre>}
      </div>
      <p id="name-form-problem" className="form-problem" aria-live="polite">
        {refusal ?? problem ?? ''}
      </p>
      {takenBy !== null && (
        <button type="button" className="form-button edit-instead" aria-disabled={saving} onClick={() => edit(takenBy.line)} onFocus={() => setFocusedOn('edit-instead')} onBlur={() => setFocusedOn(null)}>
          {editInsteadText(takenBy)}
        </button>
      )}
      {said !== null && (
        <p className={said.alert ? 'form-said refused' : 'form-said'} role={said.alert ? 'alert' : 'status'}>
          {said.text}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="form-button save" aria-disabled={result.kind !== 'applied' || saving}>
          Save
        </button>
        <button type="button" className="form-button" aria-disabled={saving} onClick={cancel} onFocus={() => setFocusedOn('cancel')} onBlur={() => setFocusedOn(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The page a link is on (G11): its title, else its address. */
function linkPage(subject: Extract<NameSubject, { kind: 'link' }>): string {
  if (subject.pageTitle) return `A link on the page "${subject.pageTitle}"`;
  if (subject.pageUrl) return `A link on ${subject.pageUrl}`;
  return 'Chrome did not say which page this link is on.';
}

/** The tab's host, shown with its title; none for an address without one. */
function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

/** Where the line goes (G9): its number and the end of the document or of the chosen section. */
function describeWhere(result: InsertResult, point: { after: number; headingMissing: boolean }, sectionLabel: string | undefined): string {
  const line = result.kind === 'applied' ? result.line : point.after + 1;
  if (point.headingMissing) return `Line ${line}, at the end of the document: the heading you chose is no longer there`;
  if (sectionLabel !== undefined) return `Line ${line}, at the end of the section "${sectionLabel}"`;
  return `Line ${line}, at the end of the document`;
}

type Refused = Exclude<InsertResult, { kind: 'applied' }>;

/**
 * Why Save is blocked (L2): a value's problem, naming the line the mapping would be, and the line that has a
 * taken name, together (G8).
 */
function problemText(problem: Refused, line: number, url: string, takenBy: Mapping | null): string {
  const field = problem.kind === 'invalid' ? fieldProblemText(problem, line, url) : '';
  const taken = takenBy !== null ? takenNameText(takenBy) : problem.kind === 'name-taken' ? `Line ${problem.line} already has this name.` : '';
  return [field, taken].filter((text) => text !== '').join(' ');
}

function refusalText(reply: Exclude<InsertReply, { kind: 'applied' }>, line: number, url: string): string {
  return reply.kind === 'storage-failed' ? `Not saved. Chrome said: ${reply.message}` : refusedValuesText(reply, line, url);
}

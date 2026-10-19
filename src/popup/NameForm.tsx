// The Name form (In use, "Name this page", "Name a link"; G8, G9, G10, G11, N6, E5): what the page is, or
// for a link the page it is on, the URL prefilled and editable, the name, the Section choice when the
// document has headings, and a preview of the exact line and where it goes. Every check and the preview
// come from the document module against the document as last read, so they follow every storage change and
// agree with what the worker writes. Save sends one insert; the confirmation is built from the worker's
// reply alone. Below the header, after an update from 1.x, the notice of what is new (G25).
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readDocument, type Mapping } from '../document/grammar';
import { insertionPoint, insertMapping, type InsertResult } from '../document/insertion';
import type { EndingGiven } from '../document/line-edits';
import { mappingOfPage } from '../document/page-mapping';
import { findSection, headingText, namedSections, type HeadingIdentity, type Section } from '../document/sections';
import { send, type InsertReply } from '../requests';
import { useFitToViewport } from './fit-to-viewport';
import { SectionChoice, type SectionOption } from './SectionChoice';
import { footerWithNotice } from './upgrade-notice';
import { UpgradeNotice, type Notice } from './UpgradeNotice';
import './name-form.css';

/**
 * What the form names: the page the popup was opened on, with its address and title when Chrome granted them
 * (E5); or a link, with the address and title of the page it is on as Chrome gave them, and the address of
 * the tab the popup was opened on, which *This page is* follows (G10).
 */
export type NameSubject =
  | { kind: 'page'; url: string | undefined; title: string | undefined }
  | { kind: 'link'; url: string; pageUrl: string | undefined; pageTitle: string | undefined; tabUrl: string | undefined };

/** A stored line, as the worker's reply gives it: what the confirmation names and what an Undo needs. */
export interface Saved {
  name: string;
  line: number;
  text: string;
  headingMissing: boolean;
  /** Present when the line went after the last line: what its Undo takes back from that line (G12). */
  endingGiven?: EndingGiven;
}

interface NameFormProps {
  /** The stored document as last read. */
  document: string;
  /** The name to start with: empty, the Name row's typed text, or what was typed before a form a command or menu item asked for showed. */
  name: string;
  subject: NameSubject;
  /** The notice of what is new, while it shows. */
  notice: Notice;
  onSaved(saved: Saved): void;
  onCancel(): void;
}

export function NameForm({ document: stored, name: startName, subject, notice, onSaved, onCancel }: NameFormProps) {
  const layout = useFitToViewport();
  const nameField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(startName);
  const [url, setUrl] = useState(subject.url ?? '');
  // The heading as named when chosen, found again by that identity at every read, never by its position (G9).
  const [heading, setHeading] = useState<HeadingIdentity | null>(null);
  // Why the last save stored nothing, until a value changes.
  const [refusal, setRefusal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const [cancelFocused, setCancelFocused] = useState(false);

  const read = useMemo(() => readDocument(stored), [stored]);
  const sections = useMemo(() => namedSections(read.lines), [read]);
  const result = useMemo(() => insertMapping(stored, { name, url, note: '' }, heading), [stored, name, url, heading]);
  const point = insertionPoint(read.lines, heading);
  const tabUrl = subject.kind === 'link' ? subject.tabUrl : subject.url;
  const thisPage = tabUrl === undefined ? undefined : mappingOfPage(read.mappings, tabUrl);
  const label = (section: Section) => headingText(read.lines, section.heading) || `Heading at line ${section.heading.first}`;
  const chosen = heading === null ? undefined : findSection(read.lines, heading);
  const options: SectionOption[] = [{ key: 'end', label: 'End of document' }, ...sections.map((section) => ({ key: `${section.heading.first}`, label: label(section) }))];
  const chosenIndex = heading === null ? 0 : chosen === undefined ? null : 1 + sections.findIndex((section) => section.heading.first === chosen.heading.first);
  const problem = result.kind === 'applied' ? null : problemText(result, point.after + 1, url, read.mappings);

  const save = async () => {
    if (inFlight.current || result.kind !== 'applied') return;
    inFlight.current = true;
    setSaving(true);
    setRefusal(null);
    const reply = await send({ kind: 'insert', name, url, note: '', heading });
    if (reply.kind === 'applied') {
      onSaved({ name: storedName(reply.text), line: reply.line, text: reply.text, headingMissing: reply.headingMissing, endingGiven: reply.endingGiven });
      return;
    }
    inFlight.current = false;
    setSaving(false);
    setRefusal(refusalText(reply, point.after + 1, url, read.mappings));
  };

  // The name field has the focus when the form appears, with the caret after a prefilled name.
  useLayoutEffect(() => {
    const field = nameField.current;
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }, []);

  // Another view's write can remove the last heading and the Section choice with it: a focus that fell to the
  // page body with it goes to the name field, where the form starts, never to nothing (G32).
  const hasSections = sections.length > 0;
  useLayoutEffect(() => {
    if (document.activeElement === document.body) nameField.current?.focus();
  }, [hasSections]);

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
  // The footer is fixed, so it holds no typed or stored text, which can be as long as the document.
  const footer = cancelFocused
    ? 'Enter returns to search'
    : saving
      ? 'Saving · Enter does nothing until it is stored'
      : result.kind === 'applied'
        ? `Enter saves it as line ${result.line}`
        : `Enter does nothing · ${result.kind === 'name-taken' ? `Line ${result.line} already has this name.` : problem}`;

  return (
    <main className="popup" ref={layout.root}>
      <header className="form-header">
        <h1 className="form-title">{subject.kind === 'link' ? 'Name this link' : 'Name this page'}</h1>
      </header>
      <UpgradeNotice notice={notice} start={nameField} />
      <div className="view" ref={layout.view} role="region" aria-label="Name form">
        <div className="view-content" ref={layout.content}>
          <form
            className="name-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
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
              {thisPage && <p className="this-page">This page is "{thisPage.name}"</p>}
            </div>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                ref={nameField}
                className="field-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={result.kind === 'name-taken' || (result.kind === 'invalid' && result.field === 'name')}
                aria-describedby="name-form-problem"
                value={name}
                onChange={(event) => {
                  setRefusal(null);
                  setName(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span className="field-label">URL</span>
              <input
                className="field-input field-url"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={result.kind === 'invalid' && result.field === 'url'}
                aria-describedby="name-form-problem"
                value={url}
                onChange={(event) => {
                  setRefusal(null);
                  setUrl(event.target.value);
                }}
              />
            </label>
            {sections.length > 0 && (
              <SectionChoice
                options={options}
                chosen={chosenIndex}
                onChoose={(index) => {
                  setRefusal(null);
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
            <div className="form-actions">
              <button type="submit" className="form-button save" aria-disabled={result.kind !== 'applied' || saving}>
                Save
              </button>
              <button type="button" className="form-button" onClick={onCancel} onFocus={() => setCancelFocused(true)} onBlur={() => setCancelFocused(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
      <footer className="footer">{footerWithNotice(footer, notice)}</footer>
    </main>
  );
}

/** The name of the line the worker stored, read back from its exact text. */
function storedName(text: string): string {
  return readDocument(text).mappings[0]?.name ?? '';
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

/** Why Save is blocked, naming the line that holds a taken name or else the line the mapping would be (L2). */
function problemText(problem: Refused, line: number, url: string, mappings: readonly Mapping[]): string {
  if (problem.kind === 'name-taken') {
    const holder = mappings.find((mapping) => mapping.line === problem.line);
    return holder ? `Line ${problem.line} already has the name "${holder.name}".` : `Line ${problem.line} already has this name.`;
  }
  if (problem.field === 'name') {
    if (problem.rule === 'empty') return `Line ${line} needs a name.`;
    if (problem.rule === 'backslash') return `Line ${line}: a name cannot contain a backslash (\\), which starts a comment.`;
    return `Line ${line}: a name cannot contain a line break.`;
  }
  if (problem.field === 'url') {
    if (problem.rule === 'whitespace') return `Line ${line}: a URL cannot contain spaces or other whitespace.`;
    if (problem.rule === 'backslash') return `Line ${line}: a URL cannot contain a backslash (\\), which starts a comment.`;
    return url === '' ? `Line ${line} needs a URL.` : `Line ${line}: a URL must begin with a scheme, such as https:`;
  }
  // The form sends no note; the worker checks one all the same.
  return problem.rule === 'backslash' ? `Line ${line}: a note cannot contain a backslash (\\).` : `Line ${line}: a note cannot contain a line break.`;
}

function refusalText(reply: Exclude<InsertReply, { kind: 'applied' }>, line: number, url: string, mappings: readonly Mapping[]): string {
  if (reply.kind === 'storage-failed') return `Not saved. Chrome said: ${reply.message}`;
  if (reply.kind === 'name-taken') return `Not saved: line ${reply.line} already has this name.`;
  return `Not saved: ${problemText(reply, line, url, mappings)}`;
}

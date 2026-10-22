// The List view's rules (In use, "Edit the list"; F14, G15, G16, P2, L2), pure, for `ListView.tsx`: the items
// a document lists, in document order with the document's own line numbers (a mapping, a heading as one item,
// an unreadable line; no blank line), each keyed so that a change elsewhere leaves its node as it is; where an
// open editor and a confirmation stand among them; and what Enter does on a row's control and on *Add
// mapping*. Every rule about the document's text they rest on is the document module's (R2).
import { findAnchor, type Anchor } from '../document/anchor';
import { readDocument, type DocumentError, type Mapping } from '../document/grammar';
import { findSections, headingName } from '../document/sections';
import { undoFooter, type Confirmed, type Outcome } from '../line-changes/outcomes';
import { whatBecameOf } from '../line-changes/row-editor';
import { COPY_TAB_URL_SAYS } from './copy-tab-url';

export type ListItem =
  /** A heading (F14): one item for its run of comment-only lines, `line` its first, `name` what it is called (P2). */
  | { kind: 'heading'; key: string; line: number; name: string }
  /** A mapping line: its number and exact text, which a change from its row names (the anchor), and its mapping. */
  | { kind: 'mapping'; key: string; line: number; text: string; mapping: Mapping }
  /** A line the extension cannot read (G16): its number, its raw text, and why. */
  | { kind: 'unreadable'; key: string; line: number; text: string; error: DocumentError };

export type MappingItem = Extract<ListItem, { kind: 'mapping' }>;

/**
 * The items `document` lists. A mapping line is keyed by its exact text, which no other mapping line has
 * (a repeated name makes the later line unreadable) and which a move does not change, so its row keeps its
 * node wherever the line goes; a heading by its lines' texts and an unreadable line by its text, each with
 * how many alike come before it, so a line added or removed elsewhere leaves them as they are.
 */
export function listItems(document: string): ListItem[] {
  const { lines } = readDocument(document);
  const headings = new Map(findSections(lines).map(({ heading }) => [heading.first, heading]));
  const seen = new Map<string, number>();
  const counted = (key: string) => {
    const before = seen.get(key) ?? 0;
    seen.set(key, before + 1);
    return `${key} ${before}`;
  };
  const items: ListItem[] = [];
  for (const line of lines) {
    if (line.kind === 'mapping') items.push({ kind: 'mapping', key: `mapping ${line.text}`, line: line.number, text: line.text, mapping: line.mapping });
    else if (line.kind === 'unreadable') {
      const error: DocumentError = line.problem === 'repeated-name' ? { line: line.number, problem: line.problem, heldBy: line.heldBy } : { line: line.number, problem: line.problem };
      items.push({ kind: 'unreadable', key: counted(`unreadable ${line.text}`), line: line.number, text: line.text, error });
    } else {
      const heading = headings.get(line.number);
      if (heading === undefined) continue;
      const texts = lines.slice(heading.first - 1, heading.last).map((each) => each.text);
      items.push({ kind: 'heading', key: counted(`heading ${texts.join('\n')}`), line: heading.first, name: headingName(lines, heading) });
    }
  }
  return items;
}

/**
 * Where something the view adds stands among the items, by the document's line numbers: in place of the
 * mapping row of line N (`on`), else directly before the first item at line N or below (`before`), or directly
 * after every item at line N or above (`after`); after the last item when none is below.
 */
export interface Place {
  kind: 'on' | 'before' | 'after';
  line: number;
}

/**
 * Where the editor opened on `anchor` stands in `document`, the stored document as now read (G13): on the line
 * it was opened on, found again by its text; when that has changed, on the line that now has its name, where
 * *Edit again* anchors; when that is gone too, where it was, at the number it had.
 */
export function editorPlace(document: string, anchor: Anchor): Place {
  const found = findAnchor(readDocument(document).lines, anchor.line, anchor.text);
  if (found !== undefined) return { kind: 'on', line: found };
  const became = whatBecameOf(document, anchor);
  return became.kind === 'changed' ? { kind: 'on', line: became.now.line } : { kind: 'before', line: anchor.line };
}

/**
 * Where the confirmation of `outcome` stands, so that it is beside what it confirms (G15): after the line the
 * change left, or where a removed line was; a refused Undo where the confirmation it replaces stood, `shown`.
 */
export function confirmationPlace(outcome: Outcome, shown: Place): Place {
  if (outcome.kind === 'refused') return shown;
  return { kind: outcome.kind === 'removed' ? 'before' : 'after', line: outcome.line };
}

/** An item, or what the view adds among them: the open editor, which stands in for its row, and the confirmation. */
export type ListEntry = ListItem | { kind: 'editor' | 'confirmation'; key: string; line: number };

/** The entries the view lists: `items`, with the editor at `editor` and then the confirmation at `confirmation`, each when there is one. */
export function listEntries(items: readonly ListItem[], editor: { key: string; place: Place } | null, confirmation: Place | null): ListEntry[] {
  let entries: ListEntry[] = [...items];
  if (editor !== null) entries = standing(entries, { kind: 'editor', key: editor.key, line: editor.place.line }, editor.place);
  if (confirmation !== null) entries = standing(entries, { kind: 'confirmation', key: 'confirmation', line: confirmation.line }, confirmation);
  return entries;
}

function standing(entries: ListEntry[], entry: ListEntry, place: Place): ListEntry[] {
  if (place.kind === 'on') {
    const row = entries.findIndex((each) => each.kind === 'mapping' && each.line === place.line);
    if (row !== -1) return [...entries.slice(0, row), entry, ...entries.slice(row + 1)];
  }
  const below = entries.findIndex((each) => (place.kind === 'after' ? each.line > place.line : each.line >= place.line));
  const at = below === -1 ? entries.length : below;
  return [...entries.slice(0, at), entry, ...entries.slice(at)];
}

/** The control on a row with the focus: a mapping row's pencil or an unreadable row's *Fix in text*, by the row's line. */
export interface RowControl {
  control: 'pencil' | 'fix';
  line: number;
}

/**
 * What Enter does in the view (L2) with the focus on `focused`: a row's control or *Add mapping* (`add`), while
 * `waiting` for an editor's or the Name form's change to be stored, when every other edit waits, and while the
 * form is open (`adding`); the confirmation's Undo; the form's *Copy tab URL* (`copy`); else, while an editor or
 * the Name form is open, what it says (`editorSays`). Like every footer it holds no name or text of a line,
 * which can be as long as the document.
 */
export function whatEnterDoes(
  focused: RowControl | 'undo' | 'add' | 'copy' | null,
  { confirmed, undoing, waiting, adding, editorSays }: { confirmed: Confirmed | null; undoing: boolean; waiting: boolean; adding: boolean; editorSays: string | null },
): string {
  if (focused === 'undo') return confirmed === null ? 'Enter does nothing' : undoFooter(confirmed.outcome, undoing);
  if (focused === 'copy') return COPY_TAB_URL_SAYS;
  if (focused === null) return editorSays ?? 'Enter does nothing';
  if (waiting) return 'Enter does nothing until the change is stored';
  if (focused === 'add') return adding ? 'Enter goes to the Name form' : 'Enter opens the Name form for a new mapping';
  return focused.control === 'pencil' ? `Enter edits line ${focused.line}` : `Enter shows the Text view at line ${focused.line}`;
}

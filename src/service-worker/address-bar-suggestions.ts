// What the address-bar keyword `uj` lists and opens (G28), without Chrome's API, which `address-bar.ts` calls:
// the popup's list for the typed text, groups (a) to (e), as Chrome's suggestions, each with the content Chrome
// hands back when it is chosen and the description it shows; the record of that list kept in `omnibox`
// (State); and which row an entered text opens (How G28).
import { fillArgument } from '../document/argument';
import { searchList, typedArgument, type SearchInput } from '../document/search';

/**
 * A listed row as `omnibox` keeps it: its line number, the mapping's name and URL as stored, and the suffix
 * its content was given. Never the content: an argument filling many `%s` can make one far larger than the
 * document (State's budget).
 */
export type StoredRow = [line: number, name: string, url: string, suffix: string];

/** The `omnibox` record: the list last shown, from which every row's content is rebuilt. */
export interface AddressBarRecord {
  /** The text typed after the keyword, as Chrome passed it. */
  typed: string;
  /** The listed rows in order; row 1 is the default suggestion. */
  rows: StoredRow[];
  /** The index in `rows` of the argument row, whose content is its filled URL; null when the list has none. */
  argumentRow: number | null;
}

export interface Suggestion {
  content: string;
  description: string;
}

export interface AddressBarList {
  record: AddressBarRecord;
  /** For `setDefaultSuggestion`: row 1's description, or one line that names no mapping. */
  defaultDescription: string;
  /** For `suggest`: rows 2 onward, at most `MOST_SUGGESTIONS`. */
  suggestions: Suggestion[];
}

/** The mapping an entered text opens, as a *jump* takes it. */
interface AddressBarMapping {
  name: string;
  url: string;
  argument: string | null;
}

/** A mapping jump or a query for Chrome's default search engine; undefined means blank input. */
export type AddressBarTarget = AddressBarMapping | { search: string };

const NOTHING_TYPED = 'Type the name of a URLJumper mapping';
const NOTHING_MATCHES = 'No URLJumper mapping matches — Enter searches your default search engine';

/**
 * How many rows at most follow the default. Chrome ranks suggestion i (from 0) at the default's relevance less
 * i + 1, and one that would rank below 0 at the default's own, so past the default's relevance (at least 1,100
 * for a typed keyword) the late rows would show before row 2 (G28). Far more than Chrome shows.
 */
const MOST_SUGGESTIONS = 1_000;

/**
 * The list for `input.typed`: G1's groups (a) to (e), never the Name row (N4), row 1 and at most
 * `MOST_SUGGESTIONS` rows after it, and nothing for blank text, for which the popup lists every mapping
 * (How G28: "empty text lists nothing"). Each row's content is unique in `comparisonForm` among the rows
 * and against the typed text, and never empty there: the first of two that collide keeps its bare content,
 * the other gets ` (line N)`, then ` 2`, ` 3`, … (How G28).
 */
export function addressBarList(input: SearchInput): AddressBarList {
  const found = searchList(input);
  const record: AddressBarRecord = { typed: input.typed, rows: [], argumentRow: null };
  const taken = new Set(['', comparisonForm(input.typed)]);
  const suggestions: Suggestion[] = [];
  for (const row of found) {
    if (row.group === 'all' || row.group === 'name') continue;
    if (record.rows.length > MOST_SUGGESTIONS) break;
    const index = record.rows.push([row.mapping.line, row.mapping.name, row.mapping.url, '']) - 1;
    if (row.group === 'argument') record.argumentRow = index;
    // The content is built as Enter rebuilds it, so the two never differ.
    const bare = contentOf(record, index)!;
    const suffix = uniqueSuffix(bare, row.mapping.line, taken);
    record.rows[index]![3] = suffix;
    taken.add(comparisonForm(bare + suffix));
    suggestions.push({ content: bare + suffix, description: describe(row.mapping.name, shownUrl(record, index)!, false) });
  }

  const [first] = record.rows;
  // `searchList` answers blank text with every mapping (or none) and any other text with at least one row,
  // the Name row when nothing else matches.
  const blank = found.every((row) => row.group === 'all');
  const defaultDescription = first ? describe(first[1], shownUrl(record, 0)!, true) : blank ? NOTHING_TYPED : NOTHING_MATCHES;
  return { record, defaultDescription, suggestions: suggestions.slice(1) };
}

/**
 * What the text Chrome passed on Enter opens (How G28), compared in `comparisonForm`: equal to the stored
 * typed text, the stored row 1 (the default accepted); else the stored row whose rebuilt content it equals;
 * else row 1 of a fresh list for it, from `inputs`. Without a row, nonblank input searches and blank input
 * opens nothing. A stored row opens with the name and URL stored for it, so a document changed since still
 * opens what was shown; a stored no-match default likewise stays a search.
 */
export function enteredTarget(text: string, stored: AddressBarRecord | undefined, inputs: Omit<SearchInput, 'typed'>): AddressBarTarget | undefined {
  const entered = comparisonForm(text);
  if (stored !== undefined) {
    // In the comparison form like every other text, not `trim` alone, so the typed text matches in whichever
    // form Chrome hands it back (S7); no content can, since contents differ from it in this form.
    if (entered === comparisonForm(stored.typed)) return targetOf(stored, 0) ?? searchTarget(stored.typed);
    for (let index = 0; index < stored.rows.length; index++) {
      const content = contentOf(stored, index);
      if (content !== undefined && comparisonForm(content) === entered) return targetOf(stored, index);
    }
  }
  return targetOf(addressBarList({ ...inputs, typed: text }).record, 0) ?? searchTarget(text);
}

function searchTarget(text: string): { search: string } | undefined {
  // Keep the original query: Chrome may have sanitized the accepted default's text (S7).
  return text.trim() === '' ? undefined : { search: text };
}

/** The `omnibox` record as stored, or undefined when what is stored is not one. */
export function readAddressBarRecord(value: unknown): AddressBarRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { typed, rows, argumentRow } = value as Record<string, unknown>;
  if (typeof typed !== 'string' || !Array.isArray(rows) || !rows.every(isStoredRow)) return undefined;
  if (argumentRow !== null && !(Number.isInteger(argumentRow) && (argumentRow as number) >= 0 && (argumentRow as number) < rows.length)) return undefined;
  return { typed, rows, argumentRow: argumentRow as number | null };
}

/**
 * The form every address-bar text is compared in: as later Chrome sanitizes a content (S7), its ends trimmed
 * of base's `kWhitespaceUTF16` and then LF, CR, tab, U+2028, and U+2029 removed, and then trimmed as
 * ECMAScript trims. Chrome 127 passes a content unchanged and later Chrome sanitized, and the two whitespaces
 * differ (U+0085 is only Chrome's, U+FEFF only ECMAScript's), so texts equal in this form are the same entry
 * under both. A lone surrogate is compared as U+FFFD: Chrome holds a content as UTF-8, which cannot carry one.
 */
export function comparisonForm(value: string): string {
  const text = value.toWellFormed();
  let start = 0;
  let end = text.length;
  // Scanned by hand: a regular expression anchored at the end backtracks quadratically on long runs.
  while (start < end && CHROME_WHITESPACE.test(text.charAt(start))) start++;
  while (end > start && CHROME_WHITESPACE.test(text.charAt(end - 1))) end--;
  return text.slice(start, end).replace(CHROME_REMOVES, '').trim();
}

// base's kWhitespaceUTF16 (whitespace_constants.h at 470aafad67f9), and AutocompleteInput::kInvalidChars.
const CHROME_WHITESPACE = /[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;
const CHROME_REMOVES = /[\n\r\t\u2028\u2029]/g;

/** The URL row `index` shows: the argument row's filled URL, else the mapping's URL. */
function shownUrl(record: AddressBarRecord, index: number): string | undefined {
  const [, name, url] = record.rows[index]!;
  if (index !== record.argumentRow) return url;
  const argument = typedArgument(record.typed, name);
  return argument === undefined ? undefined : fillArgument(url, argument);
}

/** Row `index`'s content: the mapping's name, or the argument row's filled URL, then its suffix. */
function contentOf(record: AddressBarRecord, index: number): string | undefined {
  const [, name, , suffix] = record.rows[index]!;
  const bare = index === record.argumentRow ? shownUrl(record, index) : name;
  return bare === undefined ? undefined : bare + suffix;
}

function targetOf(record: AddressBarRecord, index: number): AddressBarMapping | undefined {
  const row = record.rows[index];
  if (row === undefined) return undefined;
  const [, name, url] = row;
  if (index !== record.argumentRow) return { name, url, argument: null };
  const argument = typedArgument(record.typed, name);
  return argument === undefined ? undefined : { name, url, argument };
}

function uniqueSuffix(bare: string, line: number, taken: ReadonlySet<string>): string {
  if (!taken.has(comparisonForm(bare))) return '';
  const suffix = ` (line ${line})`;
  let candidate = suffix;
  for (let n = 2; taken.has(comparisonForm(bare + candidate)); n++) candidate = `${suffix} ${n}`;
  return candidate;
}

/**
 * A row's description in S7's XML: the name, then the URL marked as one. Chrome parses it as XML 1.0 and
 * refuses the whole call for one that is not well formed, so the text is escaped and a character XML 1.0
 * cannot hold is shown as U+FFFD. Chrome writes the typed text in place of the first `%s` of the default
 * suggestion's text, so there a U+2060 WORD JOINER goes inside each `%s` (How G1, G2, G28); no markup here
 * stands between a `%` and an `s`, so the text holds one only where a name or URL does.
 */
function describe(name: string, url: string, isDefault: boolean): string {
  const text = (piece: string) => {
    const escaped = xmlText(piece);
    return isDefault ? escaped.replaceAll('%s', '%\u2060s') : escaped;
  };
  return `${text(name)} <dim>–</dim> <url>${text(url)}</url>`;
}

// XML 1.0's Char leaves out the C0 controls but tab, LF, and CR, U+FFFE, U+FFFF, and lone surrogates.
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function xmlText(text: string): string {
  return text.toWellFormed().replace(NOT_XML, '\uFFFD').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function isStoredRow(value: unknown): value is StoredRow {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const [line, name, url, suffix] = value as unknown[];
  return Number.isInteger(line) && typeof name === 'string' && typeof url === 'string' && typeof suffix === 'string';
}

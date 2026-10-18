// The search list (G1) in its order (G2). The popup and the address bar both call `searchList` with what
// they read from storage, so they list the same mappings in the same order.
import { fillArgument, isArgumentAlias } from './argument';
import { readDocument, type Mapping } from './grammar';
import { useScoreLog2, type Usage } from './score';

export type SearchOrder = 'document' | 'smart';

/**
 * One row of the list. `all` rows are the list for blank typed text; the rest are G1's groups: (a) `exact`,
 * (b) `prefix`, (c) `argument`, whose URL is filled with `fillArgument(mapping.url, argument)`, never
 * undefined for a listed row, (d) `contains`, (e) `address`, and (f) `name`, the row that names the page
 * with the typed text.
 */
export type SearchRow =
  | { group: 'all' | 'exact' | 'prefix' | 'contains' | 'address'; mapping: Mapping }
  | { group: 'argument'; mapping: Mapping; argument: string }
  | { group: 'name'; name: string };

export interface SearchInput {
  /** The stored document. */
  document: string;
  /** The text as typed, untrimmed. */
  typed: string;
  order: SearchOrder;
  /** The stored usage, or undefined when none is stored. */
  usage: Usage | undefined;
  /** Milliseconds since the Unix epoch; use ages are measured back from it. */
  now: number;
}

export function searchList({ document, typed, order, usage, now }: SearchInput): SearchRow[] {
  const { mappings } = readDocument(document);
  const ordered = (group: Mapping[]) => orderGroup(group, order, usage, now);
  const t = typed.trim();
  if (t === '') return ordered(mappings).map((mapping) => ({ group: 'all', mapping }));

  const exact: Mapping[] = [];
  const prefix: Mapping[] = [];
  const contains: Mapping[] = [];
  const address: Mapping[] = [];
  // Lowercasing never shortens text and at most doubles it (U+0130 becomes two code units), so a T more
  // than twice as long as every name and URL is in none of them. Such a T is not lowercased: its lowercase
  // can be longer than V8's longest string, and V8 then crashes instead of throwing.
  const longest = mappings.reduce((most, { name, url }) => Math.max(most, name.length, url.length), 0);
  const query = t.length > 2 * longest ? undefined : t.toLowerCase();
  for (const mapping of mappings) {
    if (query === undefined) break;
    const name = mapping.name.toLowerCase();
    if (name === query) exact.push(mapping);
    else if (name.startsWith(query)) prefix.push(mapping);
    else if (name.includes(query)) contains.push(mapping);
    else if (mapping.url.toLowerCase().includes(query)) address.push(mapping);
  }
  // The argument row's alias is never in another group: T then holds its name, a space, and more.
  const argumentRow = findArgumentRow(mappings, typed);

  const rows: SearchRow[] = [
    ...ordered(exact).map((mapping) => ({ group: 'exact' as const, mapping })),
    ...ordered(prefix).map((mapping) => ({ group: 'prefix' as const, mapping })),
    ...(argumentRow ? [{ group: 'argument' as const, ...argumentRow }] : []),
    ...ordered(contains).map((mapping) => ({ group: 'contains' as const, mapping })),
  ];
  const nameRow = rows.length === 0;
  rows.push(...ordered(address).map((mapping) => ({ group: 'address' as const, mapping })));
  if (nameRow) rows.push({ group: 'name', name: t });
  return rows;
}

/** Document order keeps line order. Smart order puts used mappings first, highest score first and equal
 *  scores by line, then the unused ones by line. */
function orderGroup(group: Mapping[], order: SearchOrder, usage: Usage | undefined, now: number): Mapping[] {
  if (order === 'document') return group;
  const used: { mapping: Mapping; score: number }[] = [];
  const unused: Mapping[] = [];
  for (const mapping of group) {
    const times = usage !== undefined && Object.hasOwn(usage, mapping.key) ? usage[mapping.key] : undefined;
    if (times !== undefined && times.length > 0) used.push({ mapping, score: useScoreLog2(times, now) });
    else unused.push(mapping);
  }
  used.sort((a, b) => b.score - a.score || a.mapping.line - b.mapping.line);
  return [...used.map(({ mapping }) => mapping), ...unused];
}

/**
 * G1 (c): the longest alias whose argument the typed text holds (`typedArgument`). "Longest" compares
 * lowercased names, which is the alias that takes in the most of the typed text. The row exists only when
 * `fillArgument` can fill that alias's URL, at most 2,097,152 characters; a shorter alias never stands in for it.
 */
function findArgumentRow(mappings: readonly Mapping[], typed: string): { mapping: Mapping; argument: string } | undefined {
  let found: { mapping: Mapping; argument: string; length: number } | undefined;
  for (const mapping of mappings) {
    if (!isArgumentAlias(mapping.url)) continue;
    const length = mapping.name.toLowerCase().length;
    if (found && length <= found.length) continue;
    const argument = typedArgument(typed, mapping.name);
    if (argument !== undefined) found = { mapping, argument, length };
  }
  if (!found || fillArgument(found.mapping.url, found.argument) === undefined) return undefined;
  return { mapping: found.mapping, argument: found.argument };
}

/**
 * The argument `typed` gives the alias named `name` (G1 (c)): when the text, after leading whitespace,
 * starts with the name, regardless of case, and a space, U+0020, the remainder after that space, trimmed,
 * its case kept; undefined when it does not, or when that remainder is empty. The address bar reads an
 * argument row's argument again with this from the text its list was made for.
 */
export function typedArgument(typed: string, name: string): string | undefined {
  const text = typed.trimStart();
  const lowered = name.toLowerCase();
  // Only the start of the text can hold the name and the space after it. A name's lowercase is at most
  // twice as long as it and no text's is shorter, so that start is twice the name's length and one code
  // unit, plus one for a surrogate pair the cut would split; only it is lowercased (see `searchList`).
  const start = text.slice(0, 2 * name.length + 2).toLowerCase();
  if (!start.startsWith(lowered) || start.charCodeAt(lowered.length) !== 0x20) return undefined;
  const argument = text.slice(typedLength(text, lowered.length) + 1).trim();
  return argument === '' ? undefined : argument;
}

/**
 * How much of `text` lowercases to its lowercase's first `loweredLength` code units. Lowercasing can
 * lengthen a code point (U+0130 becomes two), so the written name's length cannot be used to cut the
 * typed text; `toLowerCase` maps each code point on its own, so their lowercase lengths add up.
 */
function typedLength(text: string, loweredLength: number): number {
  let lowered = 0;
  let length = 0;
  for (const codePoint of text) {
    if (lowered >= loweredLength) break;
    lowered += codePoint.toLowerCase().length;
    length += codePoint.length;
  }
  return length;
}

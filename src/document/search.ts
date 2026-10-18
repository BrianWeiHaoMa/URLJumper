// The search list (G1) in its order (G2). The popup and the address bar both call `searchList` with what
// they read from storage, so they list the same mappings in the same order.
import { isArgumentAlias } from './argument';
import { readDocument, type Mapping } from './grammar';
import { useScoreLog2, type Usage } from './score';

export type SearchOrder = 'document' | 'smart';

/**
 * One row of the list. `all` rows are the list for blank typed text; the rest are G1's groups: (a) `exact`,
 * (b) `prefix`, (c) `argument`, whose URL is filled with `fillArgument(mapping.url, argument)`, (d)
 * `contains`, (e) `address`, and (f) `name`, the row that names the page with the typed text.
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

  const query = t.toLowerCase();
  const exact: Mapping[] = [];
  const prefix: Mapping[] = [];
  const contains: Mapping[] = [];
  const address: Mapping[] = [];
  for (const mapping of mappings) {
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
 * G1 (c): the longest alias whose name, regardless of case, starts the typed text (after leading
 * whitespace) and is followed there by a space, U+0020, with a remainder that is not empty once trimmed;
 * that trimmed remainder, its case kept, is the argument. "Longest" compares lowercased names, which is
 * the alias that takes in the most of the typed text.
 */
function findArgumentRow(mappings: readonly Mapping[], typed: string): { mapping: Mapping; argument: string } | undefined {
  const text = typed.trimStart();
  const lowered = text.toLowerCase();
  let found: { mapping: Mapping; argument: string; length: number } | undefined;
  for (const mapping of mappings) {
    if (!isArgumentAlias(mapping.url)) continue;
    const name = mapping.name.toLowerCase();
    if (found && name.length <= found.length) continue;
    if (!lowered.startsWith(name) || lowered.charCodeAt(name.length) !== 0x20) continue;
    const argument = text.slice(typedLength(text, name.length) + 1).trim();
    if (argument !== '') found = { mapping, argument, length: name.length };
  }
  return found && { mapping: found.mapping, argument: found.argument };
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

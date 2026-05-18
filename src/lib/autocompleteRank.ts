import type { Mapping } from './parser';

export type RankedAutocompleteEntry = {
  mapping: Mapping;
  matchKind: 'prefix' | 'partial';
};

/** Prefix matches first (textbox order), then substring-only matches (textbox order). */
export function rankAutocompleteEntries(
  mappings: Mapping[],
  queryRaw: string,
): RankedAutocompleteEntry[] {
  const q = queryRaw.replace(/^\s+/, '').toLowerCase();
  if (q === '') return [];
  const prefix: RankedAutocompleteEntry[] = [];
  const partial: RankedAutocompleteEntry[] = [];
  for (const m of mappings) {
    const lower = m.name.toLowerCase();
    if (!lower.includes(q)) continue;
    if (lower.startsWith(q)) {
      prefix.push({ mapping: m, matchKind: 'prefix' });
    } else {
      partial.push({ mapping: m, matchKind: 'partial' });
    }
  }
  return [...prefix, ...partial];
}

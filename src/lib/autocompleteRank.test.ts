import { describe, expect, it } from 'vitest';
import { rankAutocompleteEntries } from './autocompleteRank';
import type { Mapping } from './parser';

function m(line: number, name: string, url: string): Mapping {
  return { line, name, url };
}

describe('rankAutocompleteEntries', () => {
  it('returns prefix matches first in textbox order, then partial substring matches', () => {
    const mappings = [
      m(1, 'foobar', 'a'),
      m(2, 'bar', 'b'),
      m(3, 'foo', 'c'),
      m(4, 'bazfoo', 'd'),
    ];
    const r = rankAutocompleteEntries(mappings, 'foo');
    expect(r.map((x) => x.mapping.name)).toEqual(['foobar', 'foo', 'bazfoo']);
    expect(r.map((x) => x.matchKind)).toEqual(['prefix', 'prefix', 'partial']);
  });

  it('returns empty for blank query', () => {
    expect(rankAutocompleteEntries([m(1, 'a', 'u')], '  ')).toEqual([]);
  });
});

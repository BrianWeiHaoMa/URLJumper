import { describe, expect, test } from 'vitest';
import { fillArgument } from './argument';
import type { Usage } from './score';
import { searchList, type SearchOrder, type SearchRow } from './search';

const NOW = Date.UTC(2026, 9, 18, 12);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A row as a short string: its group, then the mapping's name, the argument, or the Name row's text. */
function shown(row: SearchRow): string {
  if (row.group === 'name') return `name ${row.name}`;
  if (row.group === 'argument') return `argument ${row.mapping.name} <${row.argument}>`;
  return `${row.group} ${row.mapping.name}`;
}

interface Options {
  order?: SearchOrder;
  usage?: Usage;
}

const rows = (lines: readonly string[], typed: string, { order = 'document', usage }: Options = {}) =>
  searchList({ document: lines.join('\n'), typed, order, usage, now: NOW });

const list = (lines: readonly string[], typed: string, options?: Options) => rows(lines, typed, options).map(shown);

describe('groups (G1)', () => {
  test('the exact name comes first, then names starting with T, whatever case or surrounding whitespace is typed', () => {
    const document = ['stocks https://stocks.example/', 'st https://st.example/'];
    for (const typed of ['st', 'ST', '  st  ', '\tst\u3000']) expect(list(document, typed), typed).toEqual(['exact st', 'prefix stocks']);
  });

  test('names containing T elsewhere come next; a mapping is listed once, in its strongest group', () => {
    const document = ['mail https://mail.example/', 'gmail https://b.example/', 'ma https://c.example/', 'news https://news.ycombinator.com/'];
    expect(list(document, 'ma')).toEqual(['exact ma', 'prefix mail', 'contains gmail']);
    expect(list(document, 'ycomb')).toEqual(['address news', 'name ycomb']);
    expect(list(document, 'YCOMB')).toEqual(['address news', 'name YCOMB']);
  });

  test('address matches follow every name match, the URL compared regardless of case', () => {
    const document = ['docs https://Example.COM/', 'example https://e.example/', 'my example https://m.example/'];
    expect(list(document, 'example')).toEqual(['exact example', 'contains my example', 'address docs']);
    expect(list(document, 'EXAMPLE.com')).toEqual(['address docs', 'name EXAMPLE.com']);
  });

  test('letters in order with gaps do not match (N5)', () => {
    expect(list(['github https://github.com/'], 'gh')).toEqual(['name gh']);
  });

  test('the Name row carries T trimmed with its case kept, and only when no name matches', () => {
    expect(list(['mail https://m.example/'], 'Stocks')).toEqual(['name Stocks']);
    expect(list(['mail https://m.example/'], '  new  name  ')).toEqual(['name new  name']);
    expect(list(['mail https://m.example/'], 'mail foo')).toEqual(['name mail foo']);
    expect(list(['mail https://m.example/'], 'mai')).toEqual(['prefix mail']);
  });

  test('a mapping row carries the line number, name, and URL as stored', () => {
    const [row] = rows(['\\ heading', 'Mail   https://Mail.example/  \\ note'], 'MAIL');
    expect(row).toEqual({
      group: 'exact',
      mapping: { line: 2, name: 'Mail', url: 'https://Mail.example/', note: 'note', key: 'mail\nhttps://Mail.example/' },
    });
  });

  test('unreadable lines, repeated names included, never appear', () => {
    const document = ['Mail https://a', 'mail https://b', 'mailbox notaurl', 'mailto'];
    expect(rows(document, 'mail').map((row) => (row.group === 'exact' ? [row.mapping.line, row.mapping.url] : shown(row)))).toEqual([
      [1, 'https://a'],
    ]);
    expect(list(document, 'https://b')).toEqual(['name https://b']);
    expect(list(document, 'notaurl')).toEqual(['name notaurl']);
    expect(list(document, 'mailbox')).toEqual(['name mailbox']);
  });

  test('a line refused for its URL lends no name: the later mapping with it is listed', () => {
    const [row] = rows(['x notaurl', 'x https://b'], 'x');
    expect(row?.group === 'exact' && row.mapping.line).toBe(2);
  });
});

describe('the argument row (G1 c)', () => {
  const aliases = [
    'y https://y.example/?q=%s',
    'yt https://www.youtube.com/results?search_query=%s',
    'g https://g.example/?q=%s',
    'g s https://gs.example/?q=%s',
  ];

  test('the text after an alias name and a space fills its URL, and no Name row follows', () => {
    const found = rows(aliases, 'yt lo-fi beats');
    expect(found.map(shown)).toEqual(['argument yt <lo-fi beats>']);
    const [row] = found;
    if (row?.group !== 'argument') throw new Error('expected the argument row');
    expect(row.mapping).toMatchObject({ line: 2, name: 'yt', url: 'https://www.youtube.com/results?search_query=%s' });
    expect(fillArgument(row.mapping.url, row.argument)).toBe('https://www.youtube.com/results?search_query=lo-fi%20beats');
  });

  test('the name matches regardless of case and the argument keeps its case', () => {
    expect(list(aliases, 'YT Lo-Fi')).toEqual(['argument yt <Lo-Fi>']);
  });

  test('leading whitespace is skipped and the argument is trimmed, inner spaces kept', () => {
    const [row] = rows(aliases, '  yt   lo  fi  ');
    expect(row && shown(row)).toBe('argument yt <lo  fi>');
    if (row?.group === 'argument') expect(fillArgument(row.mapping.url, row.argument)).toBe('https://www.youtube.com/results?search_query=lo%20%20fi');
  });

  test('the longest alias the typed text starts with wins', () => {
    expect(list(aliases, 'g s foo')).toEqual(['argument g s <foo>']);
    expect(list(aliases, 'g foo')).toEqual(['argument g <foo>']);
  });

  test('a longer alias with nothing after it gives way to a shorter one with text after it', () => {
    expect(list(aliases, 'g s')).toEqual(['exact g s', 'argument g <s>']);
  });

  test('an alias with nothing after it, or only spaces, has no argument row', () => {
    expect(list(aliases, 'yt')).toEqual(['exact yt']);
    expect(list(aliases, 'yt ')).toEqual(['exact yt']);
    expect(list(aliases, 'yt   ')).toEqual(['exact yt']);
  });

  test('the separating space is U+0020 only', () => {
    expect(list(aliases, 'yt\tlo')).toEqual(['name yt\tlo']);
    expect(list(aliases, 'yt\u00A0lo')).toEqual(['name yt\u00A0lo']);
  });

  test('a name whose lowercase is longer than it is cuts the typed text where the name ends', () => {
    const document = ['İ https://e/?q=%s'];
    for (const typed of ['İ Cat', 'i\u0307 Cat', '  İ  Cat ']) {
      const found = rows(document, typed);
      expect(found.map(shown), typed).toEqual(['argument İ <Cat>']);
      const [row] = found;
      if (row?.group === 'argument') expect(fillArgument(row.mapping.url, row.argument)).toBe('https://e/?q=Cat');
    }
  });

  test('the argument row sits after the prefix matches and before the contains matches', () => {
    const document = ['yt https://y.example/?q=%s', 'yt lofi https://a.example/', 'my yt lo https://b.example/'];
    expect(list(document, 'yt lo')).toEqual(['prefix yt lofi', 'argument yt <lo>', 'contains my yt lo']);
  });

  test('a name without %s takes no argument', () => {
    expect(list(['mail https://mail.example/'], 'mail foo')).toEqual(['name mail foo']);
  });

  describe('only while the filled URL is at most 2,097,152 characters, the longest Chrome navigates to', () => {
    const groups = (lines: readonly string[], typed: string) => rows(lines, typed).map((row) => row.group);

    test('up to that length the row is offered; past it the list is G1 without the row', () => {
      expect(groups(['q x:%s'], `q ${'a'.repeat(2_097_150)}`)).toEqual(['argument']);
      expect(groups(['q x:%s'], `q ${'a'.repeat(2_097_151)}`)).toEqual(['name']);
      // x:%s/%s filled with n × é is 3 + 2 × 6n characters long.
      expect(groups(['q x:%s/%s'], `q ${'é'.repeat(174_762)}`)).toEqual(['argument']);
      expect(groups(['q x:%s/%s'], `q ${'é'.repeat(174_763)}`)).toEqual(['name']);
    });

    test('a fill too long to build is measured, not built', () => {
      expect(groups([`q x:${'%s'.repeat(65_536)}`], `q ${'a'.repeat(65_536)}`)).toEqual(['name']);
      expect(groups(['q x:%s'], `q ${'a'.repeat(3_000_000)}`)).toEqual(['name']);
    });

    test("when the longest alias's fill is too long, no shorter alias takes the text instead", () => {
      expect(groups(['g x:%s', `g s x:${'%s'.repeat(2_000)}`], `g s ${'a'.repeat(1_100)}`)).toEqual(['name']);
    });
  });
});

describe('typed text of any length', () => {
  test('a name or alias whose lowercase is twice as long as it is still matches', () => {
    expect(list(['İİ x:'], 'i̇i̇')).toEqual(['exact İİ']);
    expect(list(['İİ x:%s'], 'i̇i̇ cat')).toEqual(['argument İİ <cat>']);
  });

  test('text whose lowercase is longer than a string can be still gets its list', () => {
    // 268,435,445 × U+0130 lowercases to 536,870,890 code units, past the longest string V8 holds.
    const typed = 'İ'.repeat(268_435_445);
    expect(rows(['q x:%s', 'İ https://i'], typed).map((row) => row.group)).toEqual(['name']);
  });
});

describe('blank typed text (G3)', () => {
  const document = ['b https://b', 'bad', 'a https://a', 'B https://dup', 'yt https://y/?q=%s', ''];

  test('every mapping by line number, and no other row', () => {
    for (const typed of ['', '   ', '\t\u3000']) expect(list(document, typed), JSON.stringify(typed)).toEqual(['all b', 'all a', 'all yt']);
  });
});

describe('order within groups (G2, G27)', () => {
  const abcd = ['a https://a', 'b https://b', 'c https://c', 'd https://d'];
  const usedOnce = (time: number) => [time];

  test('Smart order puts used mappings first; Document order ignores usage', () => {
    const usage = { 'c\nhttps://c': usedOnce(NOW - HOUR) };
    expect(list(abcd, '', { order: 'smart', usage })).toEqual(['all c', 'all a', 'all b', 'all d']);
    expect(list(abcd, '', { order: 'document', usage })).toEqual(['all a', 'all b', 'all c', 'all d']);
  });

  test('one use within 24 hours ranks above ten uses older than 30 days', () => {
    const usage = {
      'a\nhttps://a': Array.from({ length: 10 }, () => NOW - 30 * DAY - 1),
      'b\nhttps://b': usedOnce(NOW - 23 * HOUR - 59 * 60 * 1000),
    };
    expect(list(abcd, '', { order: 'smart', usage })).toEqual(['all b', 'all a', 'all c', 'all d']);
  });

  test('the score counts every kept use, not only the last', () => {
    const usage = {
      'a\nhttps://a': usedOnce(NOW - DAY),
      'b\nhttps://b': Array.from({ length: 10 }, () => NOW - 2 * DAY),
    };
    expect(list(abcd, '', { order: 'smart', usage })).toEqual(['all b', 'all a', 'all c', 'all d']);
  });

  test('a use long ago still ranks above no use; an entry with no times is no use', () => {
    expect(list(abcd, '', { order: 'smart', usage: { 'd\nhttps://d': usedOnce(NOW - 365 * DAY), 'c\nhttps://c': [] } })).toEqual([
      'all d',
      'all a',
      'all b',
      'all c',
    ]);
  });

  test('ordering stays inside each group', () => {
    const document = ['mail https://m1', 'mango https://m2', 'koma https://m3'];
    const usage = { 'mango\nhttps://m2': usedOnce(NOW - HOUR), 'koma\nhttps://m3': Array.from({ length: 10 }, () => NOW - HOUR) };
    expect(list(document, 'ma', { order: 'smart', usage })).toEqual(['prefix mango', 'prefix mail', 'contains koma']);
  });

  test('equal scores go by line number', () => {
    const usage = { 'z\nhttps://z': usedOnce(NOW - HOUR), 'a\nhttps://a': usedOnce(NOW - HOUR) };
    expect(list(['z https://z', 'a https://a', 'm https://m'], '', { order: 'smart', usage })).toEqual(['all z', 'all a', 'all m']);
  });

  test('usage is found by the key: the lowercased name and the URL as written', () => {
    const document = ['a https://a', 'Mail https://M.example'];
    expect(list(document, '', { order: 'smart', usage: { 'mail\nhttps://M.example': usedOnce(NOW) } })).toEqual(['all Mail', 'all a']);
    const elsewhere = { 'Mail\nhttps://M.example': usedOnce(NOW), 'mail\nhttps://m.example': usedOnce(NOW), 'other\nhttps://a': usedOnce(NOW) };
    expect(list(document, '', { order: 'smart', usage: elsewhere })).toEqual(['all a', 'all Mail']);
  });

  test('uses decades old keep their order after the score itself has rounded to 0', () => {
    const usage = { 'old\nx:old': [Date.UTC(2027, 0, 1)], 'recent\nx:recent': [Date.UTC(2028, 0, 1)] };
    const listed = searchList({ document: 'old x:old\nrecent x:recent', typed: '', order: 'smart', usage, now: Date.UTC(2050, 0, 1) });
    expect(listed.map(shown)).toEqual(['all recent', 'all old']);
  });

  test('with no usage stored, Smart order is line order', () => {
    expect(list(abcd, '', { order: 'smart' })).toEqual(['all a', 'all b', 'all c', 'all d']);
  });
});

describe('a document as 1.x stored it (G23)', () => {
  const document = [
    '\\ Markets',
    'stocks               https://stocks.example/',
    'st                   https://st.example/',
    'stockholm\thttps://stockholm.example/      \\ trip',
    'mail                 https://mail.example/',
    '',
    'this line is not a mapping',
    'Stocks               https://stocks.example/old',
    '',
  ].join('\r\n');
  const listed = (typed: string) => searchList({ document, typed, order: 'document', usage: undefined, now: NOW });

  test('a prefix shared by two names lists them in line order', () => {
    expect(listed('sto').map(shown)).toEqual(['prefix stocks', 'prefix stockholm']);
  });

  test('a name typed in full that an earlier name starts with is listed first, trailing whitespace ignored', () => {
    for (const typed of ['st', 'st   ', '  st', 'St\t']) {
      expect(listed(typed).map(shown), JSON.stringify(typed)).toEqual(['exact st', 'prefix stocks', 'prefix stockholm']);
    }
  });

  test('the name matches 1.x listed keep their relative order, the exact name moved first', () => {
    const mappings = [
      { line: 2, name: 'stocks' },
      { line: 3, name: 'st' },
      { line: 4, name: 'stockholm' },
      { line: 5, name: 'mail' },
    ];
    for (const typed of ['s', 'st', 'sto', 'stocks', 'ock', 'k', 'm', 'ai', 'l', 'x']) {
      const startsWith = mappings.filter(({ name }) => name.startsWith(typed));
      const elsewhere = mappings.filter(({ name }) => name.includes(typed) && !name.startsWith(typed));
      const exactFirst = [...startsWith.filter(({ name }) => name === typed), ...startsWith.filter(({ name }) => name !== typed), ...elsewhere];
      const nameRows = listed(typed).flatMap((row) =>
        row.group === 'exact' || row.group === 'prefix' || row.group === 'contains' ? [row.mapping.line] : [],
      );
      expect(nameRows, typed).toEqual(exactFirst.map(({ line }) => line));
    }
  });

  test('lines are read without their CRLF endings, the tab separates, and the comment is a note', () => {
    expect(listed('stockholm')).toMatchObject([{ group: 'exact', mapping: { line: 4, url: 'https://stockholm.example/', note: 'trip' } }]);
    expect(listed('mail')).toMatchObject([{ group: 'exact', mapping: { line: 5, url: 'https://mail.example/' } }]);
  });

  test('the unreadable and repeated lines never appear', () => {
    for (const typed of ['this', 'mapping', 'not', 'Stocks', 'old', 'stocks.example/old', 'example', '']) {
      const lines = listed(typed).flatMap((row) => (row.group === 'name' ? [] : [row.mapping.line]));
      expect(lines, typed).not.toContain(7);
      expect(lines, typed).not.toContain(8);
    }
    expect(listed('old').map(shown)).toEqual(['name old']);
    expect(listed('').map(shown)).toEqual(['all stocks', 'all st', 'all stockholm', 'all mail']);
  });
});

import { describe, expect, test } from 'vitest';
import { documentErrors } from './grammar';
import { mergedText, mergeTexts, type MergePart } from './merge';

const conflictsOf = (parts: readonly MergePart[]) => parts.flatMap((part) => (part.kind === 'conflict' ? [part] : []));
/** Each conflict's versions as lines, the stored side's first. */
const versionsOf = (parts: readonly MergePart[]) => conflictsOf(parts).map((conflict) => [conflict.stored.lines, conflict.submitted.lines]);

/** The merge with no conflict, as text. */
function settled(base: string, submitted: string, stored: string): string {
  const parts = mergeTexts(base, submitted, stored);
  expect(versionsOf(parts)).toEqual([]);
  return mergedText(parts, []);
}

describe('changes on one side', () => {
  test('stored side only: the merge is the stored text', () => {
    expect(settled('a  https://a/\nb  https://b/\n', 'a  https://a/\nb  https://b/\n', 'a  https://a/\nb  https://b2/\nc  https://c/\n')).toBe('a  https://a/\nb  https://b2/\nc  https://c/\n');
  });

  test('draft side only: the merge is the submitted text', () => {
    expect(settled('a  https://a/\nb  https://b/\n', 'a  https://a/\nd  https://d/\nb  https://b/\n', 'a  https://a/\nb  https://b/\n')).toBe('a  https://a/\nd  https://d/\nb  https://b/\n');
  });

  test('a CRLF base and stored text against the LF text a text area gives: lines compare without their endings', () => {
    expect(settled('a  https://a/\r\nb  https://b/\r\n', 'a  https://a/\nb  https://b/\nd  https://d/\n', 'a  https://a/\r\ns  https://s/\r\nb  https://b/\r\n')).toBe(
      'a  https://a/\ns  https://s/\nb  https://b/\nd  https://d/\n',
    );
  });

  test('an empty base: the insertion touches the draft\'s change of the one empty line, so both are kept, the stored first', () => {
    expect(settled('', 'd  https://d/', 's  https://s/\n')).toBe('s  https://s/\nd  https://d/');
    expect(settled('', 'd  https://d/\n', 's  https://s/\n')).toBe('s  https://s/\nd  https://d/\n');
  });
});

describe('insertions at one gap', () => {
  test('distinct names: both kept, the stored first', () => {
    expect(settled('a  https://a/\n', 'a  https://a/\nd  https://d/\n', 'a  https://a/\ns  https://s/\n')).toBe('a  https://a/\ns  https://s/\nd  https://d/\n');
  });

  test('one name in different cases: a conflict, each choice giving its version', () => {
    const parts = mergeTexts('a  https://a/\n', 'a  https://a/\nSame  https://d/\n', 'a  https://a/\nsame  https://s/\n');
    expect(versionsOf(parts)).toEqual([[['same  https://s/'], ['Same  https://d/']]]);
    expect(mergedText(parts, ['stored'])).toBe('a  https://a/\nsame  https://s/\n');
    expect(mergedText(parts, ['submitted'])).toBe('a  https://a/\nSame  https://d/\n');
  });

  test('a shared name is F4\'s: a name holding another as its first word is another name, and a comment has none', () => {
    expect(settled('a  https://a/\n', 'a  https://a/\nteam  https://d/\n', 'a  https://a/\nteam cal  https://s/\n')).toBe('a  https://a/\nteam cal  https://s/\nteam  https://d/\n');
    expect(settled('a  https://a/\n', 'a  https://a/\nsame  https://s/\n', 'a  https://a/\n\\ same\n')).toBe('a  https://a/\n\\ same\nsame  https://s/\n');
  });

  test('a shared name among several lines inserted makes the whole of each side\'s insertion a version', () => {
    const parts = mergeTexts('a  https://a/\nz  https://z/\n', 'a  https://a/\nx  https://d/\n\\ mine\nz  https://z/\n', 'a  https://a/\n\\ theirs\nX  https://s/\nz  https://z/\n');
    expect(versionsOf(parts)).toEqual([[['\\ theirs', 'X  https://s/'], ['x  https://d/', '\\ mine']]]);
  });
});

describe('the same lines changed on both sides', () => {
  test('one line changed differently: a conflict with the stored version and the draft\'s', () => {
    const parts = mergeTexts('a  https://a/\nb  https://b/\n', 'a  https://a/\nb  https://draft/\n', 'a  https://a/\nb  https://stored/\n');
    expect(versionsOf(parts)).toEqual([[['b  https://stored/'], ['b  https://draft/']]]);
    expect(conflictsOf(parts)[0]).toMatchObject({ stored: { line: 2 }, submitted: { line: 2 } });
  });

  test('two conflicts chosen differently', () => {
    const parts = mergeTexts(
      'a  https://a/\nb  https://b/\nc  https://c/\n',
      'a  https://draft-a/\nb  https://b/\nc  https://draft-c/\n',
      'a  https://stored-a/\nb  https://b/\nc  https://stored-c/\n',
    );
    expect(versionsOf(parts)).toEqual([
      [['a  https://stored-a/'], ['a  https://draft-a/']],
      [['c  https://stored-c/'], ['c  https://draft-c/']],
    ]);
    expect(mergedText(parts, ['stored', 'submitted'])).toBe('a  https://stored-a/\nb  https://b/\nc  https://draft-c/\n');
    expect(mergedText(parts, ['submitted', 'stored'])).toBe('a  https://draft-a/\nb  https://b/\nc  https://stored-c/\n');
  });

  test('removed by the stored side, changed by the draft: a conflict whose stored version has no lines', () => {
    const parts = mergeTexts('a  https://a/\nb  https://b/\nc  https://c/\n', 'a  https://a/\nb  https://b2/\nc  https://c/\n', 'a  https://a/\nc  https://c/\n');
    expect(versionsOf(parts)).toEqual([[[], ['b  https://b2/']]]);
    // With no lines, the version is where the line after them is.
    expect(conflictsOf(parts)[0]).toMatchObject({ stored: { line: 2 }, submitted: { line: 2 } });
    expect(mergedText(parts, ['stored'])).toBe('a  https://a/\nc  https://c/\n');
  });

  test('an insertion strictly inside the run the other side changed is a conflict, the draft\'s version holding the lines it left alone', () => {
    const parts = mergeTexts('a  https://a/\nb  https://b/\n', 'a  https://a/\nx  https://x/\nb  https://b/\n', '');
    expect(versionsOf(parts)).toEqual([[[], ['a  https://a/', 'x  https://x/', 'b  https://b/']]]);
  });

  test('changes overlapping in a chain are one conflict, each version that side\'s whole text for its base lines', () => {
    const parts = mergeTexts(
      'a  https://a/\nb  https://b/\nc  https://c/\nd  https://d/\n',
      'a  https://a/\nb  https://b/\nc  https://c3/\nd  https://d3/\n',
      'a  https://a/\nb  https://b2/\nc  https://c2/\nd  https://d/\n',
    );
    expect(versionsOf(parts)).toEqual([
      [
        ['b  https://b2/', 'c  https://c2/', 'd  https://d/'],
        ['b  https://b/', 'c  https://c3/', 'd  https://d3/'],
      ],
    ]);
  });
});

describe('changes that only touch are both kept', () => {
  test('a line typed on the draft\'s last line, the stored side inserting before that line', () => {
    expect(settled('a  https://a/\n', 'a  https://a/\nx  https://x/', 'a  https://a/\nn  https://n/\n')).toBe('a  https://a/\nn  https://n/\nx  https://x/');
  });

  test('neighbouring lines rewritten, one on each side', () => {
    expect(settled('a  https://a/\nb  https://b/\nc  https://c/\n', 'a  https://a/\nb  https://b/\nc  https://C/\n', 'a  https://a/\nb  https://B/\nc  https://c/\n')).toBe(
      'a  https://a/\nb  https://B/\nc  https://C/\n',
    );
  });

  test('the same name inserted at different gaps: both kept, and the next Save lists the second as repeated', () => {
    const merged = settled('a  https://a/\nb  https://b/\n', 'a  https://a/\nb  https://b/\nx  https://d/\n', 'x  https://s/\na  https://a/\nb  https://b/\n');
    expect(merged).toBe('x  https://s/\na  https://a/\nb  https://b/\nx  https://d/\n');
    expect(documentErrors(merged)).toEqual([{ line: 4, problem: 'repeated-name', heldBy: 1 }]);
  });
});

describe('a change both sides made alike is brought in once', () => {
  test('the same line inserted at one gap', () => {
    expect(settled('a  https://a/\n', 'a  https://a/\nc  https://c/\n', 'a  https://a/\nc  https://c/\n')).toBe('a  https://a/\nc  https://c/\n');
  });

  test('the same lines removed', () => {
    expect(settled('a  https://a/\nb  https://b/\n', 'a  https://a/\n', 'a  https://a/\n')).toBe('a  https://a/\n');
  });

  test('the same comment inserted at one gap, which has no name', () => {
    expect(settled('a  https://a/\n', 'a  https://a/\n\\ heading\n', 'a  https://a/\n\\ heading\n')).toBe('a  https://a/\n\\ heading\n');
    expect(settled('a  https://a/\nb  https://b/\n', 'a  https://a/\n\\ heading\n\nb  https://b/\n', 'a  https://a/\n\\ heading\n\nb  https://b/\n')).toBe('a  https://a/\n\\ heading\n\nb  https://b/\n');
  });

  test('the same line rewritten the same way, beside a line rewritten differently', () => {
    const parts = mergeTexts('a  https://a/\nb  https://b/\nc  https://c/\n', 'a  https://A/\nb  https://b/\nc  https://draft/\n', 'a  https://A/\nb  https://b/\nc  https://stored/\n');
    expect(versionsOf(parts)).toEqual([[['c  https://stored/'], ['c  https://draft/']]]);
    expect(mergedText(parts, ['submitted'])).toBe('a  https://A/\nb  https://b/\nc  https://draft/\n');
  });

  test('a Save that landed though its reply was lost, saved again over the same base: nothing offered, nothing doubled', () => {
    const base = '\\ Work\nw  https://w/\n\nh  https://h/\n';
    const landed = '\\ Work\nw  https://w2/\n\\ new heading\nn  https://n/\n\nh  https://h/\n\\ end\n';
    expect(settled(base, landed, landed)).toBe(landed);
  });

  test('insertions at one gap that hold some of the same lines: those lines once, and the other lines of both kept, the stored side\'s first', () => {
    expect(settled('a  https://a/\nb  https://b/\n', 'a  https://a/\n\\ h\n\\ i\nb  https://b/\n', 'a  https://a/\n\\ h\nb  https://b/\n')).toBe('a  https://a/\n\\ h\n\\ i\nb  https://b/\n');
    // Before a line both inserted, the draft's own line still follows the stored side's lines.
    expect(settled('a  https://a/\n', 'a  https://a/\nd  https://d/\nh  https://h/\n', 'a  https://a/\nh  https://h/\ns  https://s/\n')).toBe('a  https://a/\nh  https://h/\ns  https://s/\nd  https://d/\n');
  });

  test('a Save that landed though its reply was lost, then a line typed below what it added and a line another page added: nothing offered, what landed once, both new lines kept, the stored first', () => {
    const first = 'a  https://a/\nb  https://b/\n';
    const landed = `${first}c  https://c/\n`;
    expect(settled(first, `${landed}d  https://d/\n`, `${landed}other https://other.example/\n`)).toBe(`${landed}other https://other.example/\nd  https://d/\n`);
    expect(settled('a  https://a/\n', 'a  https://a/\n\\ Work\n\\ Home\n', 'a  https://a/\n\\ Work\n')).toBe('a  https://a/\n\\ Work\n\\ Home\n');
  });

  test('insertions at one gap holding some of the same lines, a line only one inserted sharing a name with a line only the other inserted: a conflict of the two insertions whole', () => {
    const parts = mergeTexts('a  https://a/\n', 'a  https://a/\nc  https://c/\nx  https://d/\n', 'a  https://a/\nc  https://c/\nX  https://s/\n');
    expect(versionsOf(parts)).toEqual([[['c  https://c/', 'X  https://s/'], ['c  https://c/', 'x  https://d/']]]);
    expect(mergedText(parts, ['submitted'])).toBe('a  https://a/\nc  https://c/\nx  https://d/\n');
  });
});

describe('a mapping line both sides removed, which one side moved or re-added, is offered against no line', () => {
  const row = (name: string, url = name) => `${name}  https://example.com/${url}`;
  const BASE = [row('mail'), row('obsolete'), row('calendar'), row('news'), ''];
  const DELETED = [row('mail'), row('calendar'), row('news'), ''];
  const MOVED_DOWN = [row('mail'), row('calendar'), row('news'), row('obsolete'), ''];
  /** The merge of LF submitted lines with CRLF stored lines over a CRLF base, as a Text view meets them. */
  const merge = (submitted: readonly string[], stored: readonly string[], base: readonly string[] = BASE) => mergeTexts(base.join('\r\n'), submitted.join('\n'), stored.join('\r\n'));
  const settledLines = (parts: readonly MergePart[]) => parts.flatMap((part) => (part.kind === 'settled' ? part.lines : []));
  const named = (name: string) => (line: string) => line.toLowerCase().startsWith(`${name} `);
  const splitText = (text: string) => text.split('\n');

  test('the draft moved it down, the stored side deleted it: one conflict, the stored version no lines; either choice reads', () => {
    const parts = merge(MOVED_DOWN, DELETED);
    expect(versionsOf(parts)).toEqual([[[], [row('obsolete')]]]);
    // With no lines, the stored version is where the line after them is: the empty last line.
    expect(conflictsOf(parts)[0]).toMatchObject({ stored: { line: 4 }, submitted: { line: 4 } });
    expect(settledLines(parts).some(named('obsolete'))).toBe(false);
    expect(mergedText(parts, ['stored'])).toBe(DELETED.join('\n'));
    expect(mergedText(parts, ['submitted'])).toBe(MOVED_DOWN.join('\n'));
    expect(documentErrors(mergedText(parts, ['stored']))).toEqual([]);
    expect(documentErrors(mergedText(parts, ['submitted']))).toEqual([]);
  });

  test('the same below 300 other mappings', () => {
    const items = Array.from({ length: 300 }, (_, i) => row(`item-${i}`));
    const parts = merge([...items, ...MOVED_DOWN], [...items, ...DELETED], [...items, ...BASE]);
    expect(versionsOf(parts)).toEqual([[[], [row('obsolete')]]]);
    expect(mergedText(parts, ['stored'])).toBe([...items, ...DELETED].join('\n'));
  });

  test('the stored side moved it, the draft deleted it: the stored version holds it, the draft\'s none, each at line 4 of its text', () => {
    const parts = merge(DELETED, MOVED_DOWN);
    expect(versionsOf(parts)).toEqual([[[row('obsolete')], []]]);
    expect(conflictsOf(parts)[0]).toMatchObject({ stored: { line: 4 }, submitted: { line: 4 } });
    expect(mergedText(parts, ['submitted'])).toBe(DELETED.join('\n'));
  });

  test('re-added with another URL, or with its name in another case: names compare as F4 compares them', () => {
    expect(versionsOf(merge([row('mail'), row('calendar'), row('news'), row('obsolete', 'new'), ''], DELETED))).toEqual([[[], [row('obsolete', 'new')]]]);
    expect(versionsOf(merge([row('mail'), row('calendar'), row('news'), row('Obsolete', 'obsolete'), ''], DELETED))).toEqual([[[], [row('Obsolete', 'obsolete')]]]);
  });

  test('moved to a gap where the other side inserted another line: that line settled, the stored side\'s first', () => {
    const fresh = [row('mail'), row('calendar'), row('news'), row('fresh'), ''];
    const parts = merge(MOVED_DOWN, fresh);
    expect(versionsOf(parts)).toEqual([[[], [row('obsolete')]]]);
    // With no lines, the stored version is where the line after the stored side's insertion is.
    expect(conflictsOf(parts)[0]).toMatchObject({ stored: { line: 5 }, submitted: { line: 4 } });
    expect(mergedText(parts, ['stored'])).toBe(fresh.join('\n'));
    expect(mergedText(parts, ['submitted'])).toBe([row('mail'), row('calendar'), row('news'), row('fresh'), row('obsolete'), ''].join('\n'));
    // And symmetrically, the stored side's line offered before the draft's line at that gap.
    const symmetric = merge(fresh, MOVED_DOWN);
    expect(versionsOf(symmetric)).toEqual([[[row('obsolete')], []]]);
    expect(conflictsOf(symmetric)[0]).toMatchObject({ stored: { line: 4 }, submitted: { line: 4 } });
    expect(mergedText(symmetric, ['stored'])).toBe([row('mail'), row('calendar'), row('news'), row('obsolete'), row('fresh'), ''].join('\n'));
  });

  test('removed inside a part both changed differently, re-added elsewhere: the re-add is offered too', () => {
    const parts = merge([row('mail'), row('calendar', 'calendar2'), row('news'), row('obsolete'), ''], [row('mail'), row('news'), '']);
    expect(versionsOf(parts)).toEqual([
      [[], [row('calendar', 'calendar2')]],
      [[], [row('obsolete')]],
    ]);
    expect(mergedText(parts, ['stored', 'stored'])).toBe([row('mail'), row('news'), ''].join('\n'));
  });

  test('rewritten in place by one side, moved and rewritten by the other: both offered, a choice of one side throughout giving one line of that name', () => {
    const parts = merge([row('a'), row('x', 'draft')], [row('x', 'stored'), row('a')], [row('x', 'old'), row('a')]);
    expect(versionsOf(parts)).toEqual([
      [[row('x', 'stored')], []],
      [[], [row('x', 'draft')]],
    ]);
    expect(mergedText(parts, ['stored', 'stored'])).toBe([row('x', 'stored'), row('a')].join('\n'));
    expect(mergedText(parts, ['submitted', 'submitted'])).toBe([row('a'), row('x', 'draft')].join('\n'));
  });

  test('re-added by one side among lines both inserted at one gap: offered after the line both inserted, in each text', () => {
    const parts = merge([row('a'), '\\ heading', row('n')], [row('a'), '\\ heading', row('x', 'new')], [row('x', 'old'), row('a')]);
    expect(parts).toEqual([
      { kind: 'settled', lines: [row('a'), '\\ heading'] },
      // The draft's version has no lines: it is after the heading, where its own line `n` is.
      { kind: 'conflict', stored: { lines: [row('x', 'new')], line: 3 }, submitted: { lines: [], line: 3 } },
      { kind: 'settled', lines: [row('n')] },
    ]);
  });

  test('re-added inside a change only one side made that also replaced other lines: offered alone, the rest settled around it, the empty version where the replaced lines begin in the other text', () => {
    const base = [row('x', 'old'), row('a'), row('b'), row('c'), row('d'), row('e')];
    const deleted = [row('a'), row('b'), row('c'), row('d'), row('e')];
    const replaced = [row('a'), row('y'), row('x', 'new'), row('e')];
    const parts = merge(replaced, deleted, base);
    // The stored version has no lines: it is after `a`, line 1 of the stored text, where `b` to `d` begin.
    expect(parts).toEqual([
      { kind: 'settled', lines: [row('a'), row('y')] },
      { kind: 'conflict', stored: { lines: [], line: 2 }, submitted: { lines: [row('x', 'new')], line: 3 } },
      { kind: 'settled', lines: [row('e')] },
    ]);
    expect(mergedText(parts, ['stored'])).toBe([row('a'), row('y'), row('e')].join('\n'));
    expect(merge(deleted, replaced, base)).toEqual([
      { kind: 'settled', lines: [row('a'), row('y')] },
      { kind: 'conflict', stored: { lines: [row('x', 'new')], line: 3 }, submitted: { lines: [], line: 2 } },
      { kind: 'settled', lines: [row('e')] },
    ]);
  });

  test('a rename both made alike, the old name re-added by one: the re-add offered, the rename brought in once', () => {
    const base = [row('a'), row('b'), row('c')];
    const renamed = [row('a'), row('b2'), row('c')];
    const parts = merge([...renamed, row('b', 'again')], renamed, base);
    expect(versionsOf(parts)).toEqual([[[], [row('b', 'again')]]]);
    expect(mergedText(parts, ['stored'])).toBe(renamed.join('\n'));
  });

  test('moved up by the draft: the line diff pairs it and moves its neighbour, so the deletion stands with nothing offered', () => {
    const parts = merge([row('obsolete'), row('mail'), row('calendar'), row('news'), ''], DELETED);
    expect(settledLines(parts).some(named('obsolete'))).toBe(false);
    for (const conflict of conflictsOf(parts)) expect(conflict.stored.lines.some(named('obsolete'))).toBe(false);
    expect(mergedText(parts, conflictsOf(parts).map(() => 'stored'))).toBe(DELETED.join('\n'));
  });

  test('moved to different places by the two sides: each insertion offered, a choice of one side throughout giving one copy', () => {
    const up = [row('mail'), row('calendar'), row('obsolete'), row('news'), ''];
    const parts = merge(MOVED_DOWN, up);
    expect(versionsOf(parts)).toEqual([
      [[row('obsolete')], []],
      [[], [row('obsolete')]],
    ]);
    expect(mergedText(parts, ['stored', 'stored'])).toBe(up.join('\n'));
    expect(mergedText(parts, ['submitted', 'submitted'])).toBe(MOVED_DOWN.join('\n'));
  });

  test('moved alike by both, alone or among other lines at the gap: a change both made, brought in once', () => {
    expect(settled(BASE.join('\r\n'), MOVED_DOWN.join('\n'), MOVED_DOWN.join('\r\n'))).toBe(MOVED_DOWN.join('\n'));
    const withFresh = [row('mail'), row('calendar'), row('news'), row('fresh'), row('obsolete'), ''];
    expect(settled(BASE.join('\r\n'), MOVED_DOWN.join('\n'), withFresh.join('\r\n'))).toBe(withFresh.join('\n'));
  });

  test('on many random triples where one side deletes a mapping line and the other moves or re-adds it: never settled, offers well formed', () => {
    let seed = 11;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
    const placeAt = (lines: readonly string[], line: string) => {
      const at = Math.floor(random() * (lines.length + 1));
      return [...lines.slice(0, at), line, ...lines.slice(at)];
    };
    let offered = 0;
    for (let trial = 0; trial < 1_500; trial++) {
      const names = ['a', 'b', 'c', 'd', 'e', 'f'].filter(() => random() < 0.6);
      if (names.length === 0) continue;
      let base: string[] = [];
      for (const name of names) {
        if (random() < 0.3) base.push(pick(['', '\\ heading', '\\ other']));
        base.push(row(name));
      }
      const x = pick(names);
      const without = base.filter((line) => line !== row(x));
      let deleter = without;
      if (random() < 0.5) deleter = placeAt(deleter, row('p'));
      if (random() < 0.3 && deleter.length > 1) deleter = deleter.filter((_, at) => at !== Math.floor(random() * deleter.length));
      const readded = pick([row(x), row(x, 'new'), row(x.toUpperCase(), x)]);
      let mover = placeAt(without, readded);
      if (random() < 0.5) mover = placeAt(mover, row('q'));
      if (random() < 0.3) mover = placeAt(mover, '\\ mine');
      for (const [submitted, stored, deleterSide] of [
        [mover, deleter, 'stored'],
        [deleter, mover, 'submitted'],
      ] as const) {
        const parts = merge(submitted, stored, base);
        // As the merge reads them: no lines at all are one empty line.
        const [storedRead, submittedRead] = [stored, submitted].map((lines) => (lines.length === 0 ? [''] : lines)) as [string[], string[]];
        for (const conflict of conflictsOf(parts)) {
          expect(conflict.stored.lines).not.toEqual(conflict.submitted.lines);
          expect(storedRead.slice(conflict.stored.line - 1, conflict.stored.line - 1 + conflict.stored.lines.length)).toEqual(conflict.stored.lines);
          expect(submittedRead.slice(conflict.submitted.line - 1, conflict.submitted.line - 1 + conflict.submitted.lines.length)).toEqual(conflict.submitted.lines);
          const moverSide = deleterSide === 'stored' ? 'submitted' : 'stored';
          if (conflict[deleterSide].lines.length === 0 && conflict[moverSide].lines.length === 1 && conflict[moverSide].lines[0] === readded) offered++;
        }
        expect(settledLines(parts).some(named(x))).toBe(false);
        expect(splitText(mergedText(parts, conflictsOf(parts).map(() => deleterSide))).some(named(x))).toBe(false);
      }
    }
    // The family reaches the conflict between the re-added line and no line.
    expect(offered).toBeGreaterThan(100);
  });

  test('moved or deleted by one side alone: as before, nothing offered', () => {
    expect(settled(BASE.join('\r\n'), MOVED_DOWN.join('\n'), BASE.join('\r\n'))).toBe(MOVED_DOWN.join('\n'));
    expect(settled(BASE.join('\r\n'), DELETED.join('\n'), BASE.join('\r\n'))).toBe(DELETED.join('\n'));
  });
});

describe('mergedText', () => {
  test('needs a version for every conflict', () => {
    const parts = mergeTexts('a  https://a/\n', 'a  https://d/\n', 'a  https://s/\n');
    expect(() => mergedText(parts, [])).toThrow();
  });
});

describe('on many random small triples, lines drawn from a small set with blank and comment lines, endings LF or CRLF', () => {
  function seeded(seed: number) {
    return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  }
  const random = seeded(5);
  const set = ['', '', '\\ heading', '\\ other', 'a  https://a/', 'A  https://a2/', 'b  https://b/', 'c  https://c/'];
  const lines = () => Array.from({ length: Math.floor(random() * 14) }, () => set[Math.floor(random() * set.length)]!);
  const text = (lines: readonly string[]) => lines.join(random() < 0.5 ? '\n' : '\r\n');
  const triples = Array.from({ length: 1_500 }, () => ({ base: lines(), submitted: lines(), stored: lines() }));

  test('a submitted text equal to the base by content gives the stored text\'s lines joined by LF', () => {
    for (const { base, stored } of triples) expect(settled(text(base), text(base), text(stored))).toBe(stored.join('\n'));
  });

  test('a stored text equal to the base by content gives the submitted text\'s lines joined by LF', () => {
    for (const { base, submitted } of triples) expect(settled(text(base), text(submitted), text(base))).toBe(submitted.join('\n'));
  });

  test('a submitted text equal to the stored one by content gives its lines joined by LF', () => {
    for (const { base, stored } of triples) expect(settled(text(base), text(stored), text(stored))).toBe(stored.join('\n'));
  });

  test('every conflict offers two different versions, each found at its line of its own side\'s text', () => {
    for (const triple of triples) {
      const parts = mergeTexts(text(triple.base), text(triple.submitted), text(triple.stored));
      // As the merge reads them: no lines at all are one empty line.
      const asRead = (lines: string[]) => (lines.length === 0 ? [''] : lines);
      const [submitted, stored] = [asRead(triple.submitted), asRead(triple.stored)];
      for (const conflict of conflictsOf(parts)) {
        expect(conflict.stored.lines).not.toEqual(conflict.submitted.lines);
        expect(stored.slice(conflict.stored.line - 1, conflict.stored.line - 1 + conflict.stored.lines.length)).toEqual(conflict.stored.lines);
        expect(submitted.slice(conflict.submitted.line - 1, conflict.submitted.line - 1 + conflict.submitted.lines.length)).toEqual(conflict.submitted.lines);
      }
    }
  });
});

// The bounds are wide enough for a slow, shared machine (a two-core CI runner, running another file beside this
// one, took 3.9 s where a development machine takes 1.2 s for the reordering case): what they catch is a blowup in
// the merge's complexity, not a budget for the user's machine.
describe('within E3, 10,000 lines a side', () => {
  const N = 10_000;
  const baseLines = Array.from({ length: N }, (_, i) => `name${i}  https://example.com/${i}`);
  const base = baseLines.join('\n');

  test('one edit near each end on each side: under 200 ms, no conflict, all four rewrites kept', () => {
    const rewrite = (lines: readonly number[]) => baseLines.map((line, i) => (lines.includes(i + 1) ? `${line}x` : line)).join('\n');
    const started = Date.now();
    const parts = mergeTexts(base, rewrite([4, 9_997]), rewrite([5, 9_996]));
    const took = Date.now() - started;
    expect(mergedText(parts, [])).toBe(rewrite([4, 5, 9_996, 9_997]));
    expect(took).toBeLessThan(200);
  });

  test('both sides reordering every line: under 10 seconds', () => {
    const submitted = baseLines.slice().reverse().join('\n');
    const stored = Array.from({ length: N }, (_, i) => baseLines[(i * 7_919) % N]).join('\n');
    const started = Date.now();
    const parts = mergeTexts(base, submitted, stored);
    const took = Date.now() - started;
    expect(conflictsOf(parts).length).toBeGreaterThan(0);
    expect(took).toBeLessThan(10_000);
  }, 15_000);

  test('an empty base, both sides inserting every line at its one gap, ordered differently: under 10 seconds', () => {
    const submitted = `${baseLines.slice().reverse().join('\n')}\n`;
    const stored = `${Array.from({ length: N }, (_, i) => baseLines[(i * 7_919) % N]).join('\n')}\n`;
    const started = Date.now();
    const parts = mergeTexts('', submitted, stored);
    const took = Date.now() - started;
    // A line both inserted in another order is left unpaired on each side, its name on both: a conflict.
    expect(conflictsOf(parts)).toHaveLength(1);
    expect(took).toBeLessThan(10_000);
  }, 15_000);
});

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

  test('insertions at one gap that are not the same lines and share no name are another side\'s lines, both kept', () => {
    expect(settled('a  https://a/\nb  https://b/\n', 'a  https://a/\n\\ h\n\\ i\nb  https://b/\n', 'a  https://a/\n\\ h\nb  https://b/\n')).toBe('a  https://a/\n\\ h\n\\ h\n\\ i\nb  https://b/\n');
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

describe('within E3, 10,000 lines a side', () => {
  const N = 10_000;
  const baseLines = Array.from({ length: N }, (_, i) => `name${i}  https://example.com/${i}`);
  const base = baseLines.join('\n');

  test('one edit near each end on each side: under 50 ms, no conflict, all four rewrites kept', () => {
    const rewrite = (lines: readonly number[]) => baseLines.map((line, i) => (lines.includes(i + 1) ? `${line}x` : line)).join('\n');
    const started = Date.now();
    const parts = mergeTexts(base, rewrite([4, 9_997]), rewrite([5, 9_996]));
    const took = Date.now() - started;
    expect(mergedText(parts, [])).toBe(rewrite([4, 5, 9_996, 9_997]));
    expect(took).toBeLessThan(50);
  });

  test('both sides reordering every line: under 3 seconds', () => {
    const submitted = baseLines.slice().reverse().join('\n');
    const stored = Array.from({ length: N }, (_, i) => baseLines[(i * 7_919) % N]).join('\n');
    const started = Date.now();
    const parts = mergeTexts(base, submitted, stored);
    const took = Date.now() - started;
    expect(conflictsOf(parts).length).toBeGreaterThan(0);
    expect(took).toBeLessThan(3_000);
  });
});

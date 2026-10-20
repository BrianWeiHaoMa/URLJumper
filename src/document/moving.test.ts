import { describe, expect, test } from 'vitest';
import { EXAMPLE_DOCUMENT } from './example';
import { moveLineBack, moveMapping, movesAdmitted, type MoveDirection } from './moving';

/** Moves the line `text` (named as line `line`) and expects it applied, giving `document`; returns the result. */
function expectMoved(original: string, line: number, text: string, direction: MoveDirection, document: string) {
  const result = moveMapping(original, { line, text }, direction);
  expect(result, `${JSON.stringify(original)} ${direction}`).toMatchObject({ kind: 'applied', document, text });
  if (result.kind !== 'applied') throw new Error(result.kind);
  return result;
}

describe('a mapping line moved up or down (G12)', () => {
  test("F11's news moved up changes places with cal, every other byte the same", () => {
    const lines = EXAMPLE_DOCUMENT.split('\n');
    const exchanged = [...lines.slice(0, 2), lines[3], lines[2], ...lines.slice(4)].join('\n');
    expect(moveMapping(EXAMPLE_DOCUMENT, { line: 4, text: lines[3]! }, 'up')).toEqual({ kind: 'applied', document: exchanged, from: 4, line: 3, text: lines[3] });
  });

  test('comment and blank lines keep their order: the line goes directly before the previous mapping line or after the next, never swapped with its neighbour', () => {
    const original = 'A u:1\n\\ heading\n\nB u:2\n';
    expect(moveMapping(original, { line: 4, text: 'B u:2' }, 'up')).toEqual({ kind: 'applied', document: 'B u:2\nA u:1\n\\ heading\n\n', from: 4, line: 1, text: 'B u:2' });
    expect(moveMapping(original, { line: 1, text: 'A u:1' }, 'down')).toEqual({ kind: 'applied', document: '\\ heading\n\nB u:2\nA u:1\n', from: 1, line: 4, text: 'A u:1' });
  });

  test('a tab-separated mapping line is a mapping like any other, and stays byte for byte as another passes it', () => {
    const once = expectMoved('A u:1\nx\tu:9\nB u:2', 3, 'B u:2', 'up', 'A u:1\nB u:2\nx\tu:9');
    expectMoved(once.document, once.line, 'B u:2', 'up', 'B u:2\nA u:1\nx\tu:9');
    expectMoved('A u:1\nx\tu:9\nB u:2', 1, 'A u:1', 'down', 'x\tu:9\nA u:1\nB u:2');
  });

  test('unreadable lines keep their place as comments do, and a mapping passes one that does not repeat its name', () => {
    expectMoved('a u:1\nnotaurl\nb u:2\n', 3, 'b u:2', 'up', 'b u:2\na u:1\nnotaurl\n');
    expectMoved('a u:1\nb u:2\nb v:3\nc u:4', 4, 'c u:4', 'up', 'a u:1\nc u:4\nb u:2\nb v:3');
  });

  test('the first mapping cannot move up nor the last down, a heading before it or a final line break after it notwithstanding', () => {
    const original = '\\ top\nA u:1\nB u:2\n';
    expect(moveMapping(original, { line: 2, text: 'A u:1' }, 'up')).toEqual({ kind: 'immovable', passing: null });
    expect(moveMapping(original, { line: 3, text: 'B u:2' }, 'down')).toEqual({ kind: 'immovable', passing: null });
    expect(moveMapping(original, { line: 2, text: 'A u:1' }, 'down')).toEqual({ kind: 'applied', document: '\\ top\nB u:2\nA u:1\n', from: 2, line: 3, text: 'A u:1' });
    expect(moveMapping('only u:1', { line: 1, text: 'only u:1' }, 'up')).toEqual({ kind: 'immovable', passing: null });
    expect(moveMapping('only u:1', { line: 1, text: 'only u:1' }, 'down')).toEqual({ kind: 'immovable', passing: null });
  });

  test("a line that stops being last gains the document's ending, never the moved line's; a line that becomes last loses its own", () => {
    expectMoved('X u:1\r\nY u:2\nZ u:3', 3, 'Z u:3', 'up', 'X u:1\r\nZ u:3\r\nY u:2');
    expectMoved('A u:1\nB u:2\r\nC u:3', 2, 'B u:2', 'down', 'A u:1\nC u:3\nB u:2');
  });

  test('no mapping moves past a line with its name, an unreadable line repeating it: nothing would change a byte, yet that line would become the mapping', () => {
    const original = 'a u:1\na v:2\nb u:3';
    expect(moveMapping(original, { line: 1, text: 'a u:1' }, 'down')).toEqual({ kind: 'immovable', passing: 2 });
    expect(moveMapping('a u:1\nb u:2\nb v:3\nc u:4', { line: 2, text: 'b u:2' }, 'down')).toEqual({ kind: 'immovable', passing: 3 });
    // Passing the mapping line that holds the name leaves the repeat behind it, still unreadable.
    expect(moveMapping(original, { line: 3, text: 'b u:3' }, 'up')).toEqual({ kind: 'applied', document: 'b u:3\na u:1\na v:2', from: 3, line: 1, text: 'b u:3' });
  });

  test('the line is found by its exact text where it now stands, and only a mapping line is: an unreadable line with the text is stale', () => {
    const original = 'a u:1\na v:2\nb u:3';
    expect(moveMapping(original, { line: 2, text: 'a v:2' }, 'up')).toEqual({ kind: 'stale' });
    expect(moveMapping(original, { line: 2, text: 'a v:2' }, 'down')).toEqual({ kind: 'stale' });
    expect(moveMapping(original, { line: 9, text: 'b u:3' }, 'up')).toEqual({ kind: 'applied', document: 'b u:3\na u:1\na v:2', from: 3, line: 1, text: 'b u:3' });
    // Found by its text, then refused for where it would go, not for being lost.
    expect(moveMapping(original, { line: 9, text: 'a u:1' }, 'down')).toEqual({ kind: 'immovable', passing: 2 });
    expect(moveMapping(original, { line: 1, text: 'a u:9' }, 'down')).toEqual({ kind: 'stale' });
  });

  test('a line ending in a lone CR that gains an ending moves as any other: its bytes stay, and its text now reads without the CR, its mapping the same', () => {
    expect(moveMapping('a u:1\nb u:2\r', { line: 2, text: 'b u:2\r' }, 'up')).toEqual({ kind: 'applied', document: 'b u:2\r\na u:1', from: 2, line: 1, text: 'b u:2' });
    expect(moveMapping('a u:1\nb u:2\nc u:3\r', { line: 2, text: 'b u:2' }, 'down')).toEqual({ kind: 'applied', document: 'a u:1\nc u:3\r\nb u:2', from: 2, line: 3, text: 'b u:2' });
    // A line that becomes last keeps a CR that was its own content.
    expect(moveMapping('a u:1\nb u:2\r\r\nc u:3', { line: 2, text: 'b u:2\r' }, 'down')).toEqual({ kind: 'applied', document: 'a u:1\nc u:3\nb u:2\r', from: 2, line: 3, text: 'b u:2\r' });
    expectMoved('a u:1\nb u:2\nc u:3\r', 2, 'b u:2', 'up', 'b u:2\na u:1\nc u:3\r');
  });
});

describe('the moves a row editor offers, which the worker would apply', () => {
  test('up and down each as moveMapping answers them on the document as last read: where the line would go, or why it would not', () => {
    const edge = { kind: 'immovable', passing: null };
    expect(movesAdmitted('\\ top\nA u:1\nB u:2\n', { line: 2, text: 'A u:1' })).toEqual({ up: edge, down: { kind: 'applied', from: 2, line: 3 } });
    expect(movesAdmitted('\\ top\nA u:1\nB u:2\n', { line: 3, text: 'B u:2' })).toEqual({ up: { kind: 'applied', from: 3, line: 2 }, down: edge });
    expect(movesAdmitted('a u:1\na v:2\nb u:3\nc u:4', { line: 1, text: 'a u:1' })).toEqual({ up: edge, down: { kind: 'immovable', passing: 2 } });
    // Found by its text where it now stands.
    expect(movesAdmitted('a u:1\nb u:2\nc u:3', { line: 9, text: 'b u:2' })).toEqual({ up: { kind: 'applied', from: 2, line: 1 }, down: { kind: 'applied', from: 2, line: 3 } });
    // A line changed or gone is offered as the worker would answer it: stale, which a row editor's Save and Delete meet too.
    expect(movesAdmitted('a u:1\nb u:2', { line: 2, text: 'gone u:9' })).toEqual({ up: { kind: 'stale' }, down: { kind: 'stale' } });
  });
});

describe('a moved line moved back to the number it had (G15)', () => {
  const moves: [string, number, string, MoveDirection][] = [
    [EXAMPLE_DOCUMENT, 4, EXAMPLE_DOCUMENT.split('\n')[3]!, 'up'],
    ['A u:1\n\\ heading\n\nB u:2\n', 4, 'B u:2', 'up'],
    ['A u:1\n\\ heading\n\nB u:2\n', 1, 'A u:1', 'down'],
    ['A u:1\nx\tu:9\nB u:2', 3, 'B u:2', 'up'],
    ['\\ top\nA u:1\nB u:2\n', 2, 'A u:1', 'down'],
    ['A u:1\r\nB u:2\r\nC u:3', 2, 'B u:2', 'down'],
    ['a u:1\na v:2\nb u:3', 3, 'b u:3', 'up'],
  ];

  test('each move moved back gives the document back, and the move back moved back gives the move again', () => {
    for (const [original, line, text, direction] of moves) {
      const moved = moveMapping(original, { line, text }, direction);
      if (moved.kind !== 'applied') throw new Error(moved.kind);
      const back = moveLineBack(moved.document, { line: moved.line, text: moved.text }, moved.from);
      expect(back, JSON.stringify(original)).toEqual({ kind: 'applied', document: original, line, text, from: moved.line });
      if (back.kind !== 'applied') throw new Error(back.kind);
      expect(moveLineBack(back.document, { line: back.line, text: back.text }, back.from)).toEqual({ kind: 'applied', document: moved.document, line: moved.line, text, from: line });
    }
  });

  test('not the opposite move: that would leave the comment and blank lines between on the wrong side', () => {
    const moved = expectMoved('A u:1\n\\ heading\n\nB u:2\n', 4, 'B u:2', 'up', 'B u:2\nA u:1\n\\ heading\n\n');
    expect(moveMapping(moved.document, { line: 1, text: 'B u:2' }, 'down')).toMatchObject({ document: 'A u:1\nB u:2\n\\ heading\n\n' });
    expect(moveLineBack(moved.document, { line: 1, text: 'B u:2' }, 4)).toMatchObject({ document: 'A u:1\n\\ heading\n\nB u:2\n' });
  });

  test("the endings follow G12 alone: a line that stops being last gains the document's ending as it now stands", () => {
    const moved = expectMoved('X u:1\r\nY u:2\nZ u:3', 3, 'Z u:3', 'up', 'X u:1\r\nZ u:3\r\nY u:2');
    expect(moveLineBack(moved.document, { line: 2, text: 'Z u:3' }, 3)).toEqual({ kind: 'applied', document: 'X u:1\r\nY u:2\r\nZ u:3', line: 3, text: 'Z u:3', from: 2 });
    const down = expectMoved('A u:1\nB u:2\r\nC u:3', 2, 'B u:2', 'down', 'A u:1\nC u:3\nB u:2');
    expect(moveLineBack(down.document, { line: 3, text: 'B u:2' }, 2)).toEqual({ kind: 'applied', document: 'A u:1\nB u:2\nC u:3', line: 2, text: 'B u:2', from: 3 });
  });

  test('found by its text where it now stands; to a number past the end, it goes last', () => {
    expect(moveLineBack('\\ new\nb u:2\na u:1\n', { line: 1, text: 'b u:2' }, 3)).toEqual({ kind: 'applied', document: '\\ new\na u:1\nb u:2\n', line: 3, text: 'b u:2', from: 2 });
    // The lines it went back among were removed since: after the last line, the empty one a final break leaves.
    expect(moveLineBack('b u:2\na u:1\n', { line: 1, text: 'b u:2' }, 7)).toEqual({ kind: 'applied', document: 'a u:1\n\nb u:2', line: 3, text: 'b u:2', from: 1 });
    expect(moveLineBack('b u:2\na u:1', { line: 1, text: 'b u:2' }, 7)).toEqual({ kind: 'applied', document: 'a u:1\nb u:2', line: 2, text: 'b u:2', from: 1 });
  });

  test("refused while going back would pass a line with its name, by that line's number; stale when the line is not as the move left it", () => {
    const now = 'b u:3\nb x:9\na u:1\na v:2';
    expect(moveLineBack(now, { line: 1, text: 'b u:3' }, 3)).toEqual({ kind: 'name-taken', line: 2 });
    expect(moveLineBack('b u:4\na u:1\na v:2', { line: 1, text: 'b u:3' }, 3)).toEqual({ kind: 'stale' });
    expect(moveLineBack('a u:1\na v:2', { line: 1, text: 'b u:3' }, 3)).toEqual({ kind: 'stale' });
    // An unreadable line with the text is not the line: the mapping line with it is.
    expect(moveLineBack('z u:0\nb x:9\nb x:9', { line: 3, text: 'b x:9' }, 1)).toMatchObject({ kind: 'applied', document: 'b x:9\nz u:0\nb x:9', from: 2 });
  });

  test('a line ending in a lone CR that gains an ending goes back as any other, so a move of it is always undone while it stands as the move left it', () => {
    const moved = expectMoved('a u:1\nb u:2\r\r\nc u:3', 2, 'b u:2\r', 'down', 'a u:1\nc u:3\nb u:2\r');
    expect(moveLineBack(moved.document, { line: moved.line, text: moved.text }, moved.from)).toEqual({ kind: 'applied', document: 'a u:1\nb u:2\r\nc u:3', line: 2, text: 'b u:2', from: 3 });
    expect(moveLineBack('a u:1\nb u:2\r', { line: 2, text: 'b u:2\r' }, 1)).toEqual({ kind: 'applied', document: 'b u:2\r\na u:1', line: 1, text: 'b u:2', from: 2 });
    expect(moveLineBack('b u:2\na u:1\nc u:3\r', { line: 1, text: 'b u:2' }, 3)).toEqual({ kind: 'applied', document: 'a u:1\nc u:3\r\nb u:2', line: 3, text: 'b u:2', from: 1 });
  });
});

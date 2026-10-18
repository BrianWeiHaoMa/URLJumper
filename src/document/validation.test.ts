import { describe, expect, test } from 'vitest';
import { readDocument } from './grammar';
import { validateMapping, type MappingFields } from './validation';

const URL = 'https://s.example/';
const check = (fields: Partial<MappingFields>, document = '') =>
  validateMapping({ name: 'a', url: URL, note: '', ...fields }, readDocument(document).mappings);

describe('the name (G8)', () => {
  test('is checked once trimmed, and given back trimmed', () => {
    expect(check({ name: '  stocks  ' })).toEqual({ kind: 'valid', fields: { name: 'stocks', url: URL, note: '' } });
    expect(check({ name: '\na\r\n' })).toMatchObject({ kind: 'valid', fields: { name: 'a' } });
    expect(check({ name: '\ta ' })).toMatchObject({ kind: 'valid', fields: { name: 'a' } });
  });

  test('may not be empty, hold a backslash, or hold a line break, LF or CR', () => {
    expect(check({ name: '' })).toEqual({ kind: 'invalid', field: 'name', rule: 'empty' });
    expect(check({ name: '   ' })).toEqual({ kind: 'invalid', field: 'name', rule: 'empty' });
    expect(check({ name: 'a\\b' })).toEqual({ kind: 'invalid', field: 'name', rule: 'backslash' });
    expect(check({ name: 'a\nb' })).toEqual({ kind: 'invalid', field: 'name', rule: 'line-break' });
    expect(check({ name: 'a\rb' })).toEqual({ kind: 'invalid', field: 'name', rule: 'line-break' });
  });

  test('may hold U+2028, which splits no line', () => {
    expect(check({ name: 'a b' })).toMatchObject({ kind: 'valid', fields: { name: 'a b' } });
  });

  test("is taken when a mapping line has it, compared as the grammar compares names, naming that line's number", () => {
    const document = '\\ notes\n\nnot a mapping\nalpha  a:1\nStocks  s:1\n';
    expect(check({ name: 'STOCKS' }, document)).toEqual({ kind: 'name-taken', line: 5 });
    expect(check({ name: 'K' }, 'k  x:1\n')).toEqual({ kind: 'name-taken', line: 1 });
    // The second line repeats the first's name, so it is unreadable and the first holds the name.
    expect(check({ name: 'a' }, 'a  x:1\nA  y:2\n')).toEqual({ kind: 'name-taken', line: 1 });
  });

  test('is free when only an unreadable line has it', () => {
    expect(check({ name: 'stocks' }, 'stocks notaurl\n')).toMatchObject({ kind: 'valid' });
  });

  test('ß and SS stay apart, as toLowerCase keeps them', () => {
    expect(check({ name: 'STRASSE' }, 'Straße  x:1\n')).toMatchObject({ kind: 'valid' });
  });
});

describe('the URL (G8)', () => {
  test('begins with a scheme per F4', () => {
    for (const url of ['mailto:x', 'HTTPS://X', 'a1+.-:x']) expect(check({ url }), url).toMatchObject({ kind: 'valid', fields: { url } });
    for (const url of ['1a:x', 'é:x', ':x', 'x', '', 'K:x']) expect(check({ url }), url).toEqual({ kind: 'invalid', field: 'url', rule: 'no-scheme' });
  });

  test('holds no whitespace, line breaks included, and is never trimmed', () => {
    for (const url of [' https://x', 'https://x y', 'https://x ', 'https://x\n', 'https://x\r']) {
      expect(check({ url }), JSON.stringify(url)).toEqual({ kind: 'invalid', field: 'url', rule: 'whitespace' });
    }
  });

  test('holds no backslash', () => {
    expect(check({ url: 'https://x\\y' })).toEqual({ kind: 'invalid', field: 'url', rule: 'backslash' });
  });
});

describe('the note (G14)', () => {
  test('holds no backslash or line break, at its edges too: unlike the name, it is checked as given', () => {
    expect(check({ note: 'a\\b' })).toEqual({ kind: 'invalid', field: 'note', rule: 'backslash' });
    expect(check({ note: 'a\nb' })).toEqual({ kind: 'invalid', field: 'note', rule: 'line-break' });
    expect(check({ note: 'a\rb' })).toEqual({ kind: 'invalid', field: 'note', rule: 'line-break' });
    expect(check({ note: '\nhello\r\n' })).toEqual({ kind: 'invalid', field: 'note', rule: 'line-break' });
    expect(check({ note: 'hello\r' })).toEqual({ kind: 'invalid', field: 'note', rule: 'line-break' });
  });

  test('is given back trimmed', () => {
    expect(check({ note: '  see docs  ' })).toMatchObject({ kind: 'valid', fields: { note: 'see docs' } });
  });
});

test('every value is made well-formed first, a lone surrogate becoming U+FFFD', () => {
  expect(check({ name: 'a\uD800', url: 'https://e.example/?q=\uDC00', note: 'x\uD800' })).toEqual({
    kind: 'valid',
    fields: { name: 'a�', url: 'https://e.example/?q=�', note: 'x�' },
  });
  expect(check({ name: 'a\uD800' }, 'a�  x:1\n')).toEqual({ kind: 'name-taken', line: 1 });
});

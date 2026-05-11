import { describe, it, expect } from 'vitest';
import { parseMappings } from './parser';

describe('parseMappings', () => {
  it('parses a simple valid mapping', () => {
    const result = parseMappings('youtube-music https://music.youtube.com/');
    expect(result.errors).toEqual([]);
    expect(result.mappings).toEqual([
      { name: 'youtube-music', url: 'https://music.youtube.com/', line: 1 },
    ]);
  });

  it('treats text after a backslash as a comment', () => {
    const result = parseMappings(
      'youtube-music                 https://music.youtube.com/ \\here is a valid comment',
    );
    expect(result.errors).toEqual([]);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      name: 'youtube-music',
      url: 'https://music.youtube.com/',
    });
  });

  it('skips full-line comments and blank lines', () => {
    const text = [
      '\\ this whole line is a comment',
      '',
      '   \\ leading whitespace then comment',
      '',
      'github https://github.com/',
    ].join('\n');
    const result = parseMappings(text);
    expect(result.errors).toEqual([]);
    expect(result.mappings).toEqual([
      { name: 'github', url: 'https://github.com/', line: 5 },
    ]);
  });

  it('treats arbitrary whitespace between tokens as valid', () => {
    const text = 'github\t\t\t\thttps://github.com/BrianWeiHaoMa?tab=repositories';
    const result = parseMappings(text);
    expect(result.errors).toEqual([]);
    expect(result.mappings).toHaveLength(1);
  });

  it('errors when a row has only one token', () => {
    const result = parseMappings('yahoo');
    expect(result.mappings).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 1 });
    expect(result.errors[0]!.message).toMatch(/single token/i);
  });

  it('errors when a row has more than two tokens', () => {
    const result = parseMappings('yahoo https://yahoo.com/ extra');
    expect(result.mappings).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/3 tokens/);
  });

  it('accepts any URL token (no validation)', () => {
    const result = parseMappings('foo @@notaurl@@');
    expect(result.errors).toEqual([]);
    expect(result.mappings).toEqual([{ name: 'foo', url: '@@notaurl@@', line: 1 }]);
  });

  it('detects case-insensitive duplicate aliases and reports both line numbers', () => {
    const text = ['github https://github.com/', 'GitHub https://other.com/'].join('\n');
    const result = parseMappings(text);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]!.name).toBe('github');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 2 });
    expect(result.errors[0]!.message).toMatch(/Duplicate alias "GitHub"/);
    expect(result.errors[0]!.message).toMatch(/line 1/);
  });

  it('reports multiple errors across the file', () => {
    const text = [
      'github https://github.com/',
      'bad',
      'github https://duplicate.com/',
      'foo bar baz',
    ].join('\n');
    const result = parseMappings(text);
    expect(result.mappings).toHaveLength(1);
    expect(result.errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it('handles inline comments that come immediately after the URL with no space', () => {
    const result = parseMappings(
      'github https://github.com/BrianWeiHaoMa?tab=repositories\\here is another comment',
    );
    expect(result.errors).toEqual([]);
    expect(result.mappings[0]).toMatchObject({
      name: 'github',
      url: 'https://github.com/BrianWeiHaoMa?tab=repositories',
    });
  });

  it('parses the full example from the spec', () => {
    const text = [
      "\\ The ancient oak tree stood silent guard over the forgotten garden path.",
      "\\ It is generally recommended to check the tire pressure before a long road trip.",
      "",
      "\\ Most people forget that the secret to a good sourdough is simply patience.",
      "",
      "youtube-music                 https://music.youtube.com/ \\sometimes the bass is just too loud",
      "yahoo                         https://yahoo.com/",
      "",
      "\\ A flock of migratory birds decided to take a rest on the power lines this morning.",
      "",
      "",
      "github                        https://github.com/BrianWeiHaoMa?tab=repositories\\the coffee machine is making that weird noise again",
    ].join('\n');
    const result = parseMappings(text);
    expect(result.errors).toEqual([]);
    expect(result.mappings.map((m) => m.name)).toEqual([
      'youtube-music',
      'yahoo',
      'github',
    ]);
  });
});



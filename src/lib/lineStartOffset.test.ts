import { describe, it, expect } from 'vitest';
import { lineStartOffset } from './parser';

describe('lineStartOffset', () => {
  it('returns 0 for line 1 on empty text', () => {
    expect(lineStartOffset('', 1)).toBe(0);
  });

  it('returns 0 for line <= 1', () => {
    expect(lineStartOffset('a\nb\nc', 0)).toBe(0);
    expect(lineStartOffset('a\nb\nc', 1)).toBe(0);
  });

  it('returns the index after the first newline for line 2', () => {
    expect(lineStartOffset('a\nb\nc', 2)).toBe(2);
  });

  it('returns the start offset of a later line including leading whitespace', () => {
    const text = 'one\ntwo\n  three\nfour';
    expect(lineStartOffset(text, 3)).toBe(text.indexOf('  three'));
  });

  it('returns text.length when the requested line is beyond the end', () => {
    const text = 'a\nb';
    expect(lineStartOffset(text, 99)).toBe(text.length);
  });

  it('handles CRLF content by placing the offset after the \\n', () => {
    const text = 'a\r\nb';
    expect(lineStartOffset(text, 2)).toBe(3);
  });
});

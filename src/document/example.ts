// The example document (F11), which *Load example mappings* stores into an empty document, and what counts as
// empty: absent or only whitespace, the state in which the popup shows its first run (G30).
import { splitLines } from './lines';

/** F11's text exactly: these lines with LF endings and a final line break. */
export const EXAMPLE_DOCUMENT = [
  '\\ Daily: a backslash starts a comment, and a comment line like this one is a section heading',
  'mail                 https://mail.google.com/',
  'cal                  https://calendar.google.com/',
  'news                 https://news.ycombinator.com/            \\ a comment after a mapping is its note',
  '',
  '\\ Search: type the name, a space, then what to look for',
  'g                    https://www.google.com/search?q=%s',
  'yt                   https://www.youtube.com/results?search_query=%s',
  'wiki                 https://en.wikipedia.org/w/index.php?search=%s',
  '',
  '\\ Names can have spaces; blank lines are fine',
  'team calendar        https://calendar.google.com/calendar/u/0/r/week',
  '',
].join('\n');

/** Whether `document` (the empty string when absent) holds nothing but whitespace, as `\s` matches it. */
export function isEmptyDocument(document: string): boolean {
  return !/\S/.test(document);
}

export type LoadExampleResult =
  /** `first` and `last` are the lines the example wrote: all of `document`'s but the empty one after its final break. */
  | { kind: 'applied'; document: string; first: number; last: number }
  | { kind: 'not-empty' };

/** The example in place of `document` (the empty string when absent) while it is empty. */
export function loadExample(document: string): LoadExampleResult {
  if (!isEmptyDocument(document)) return { kind: 'not-empty' };
  return { kind: 'applied', document: EXAMPLE_DOCUMENT, first: 1, last: splitLines(EXAMPLE_DOCUMENT).length - 1 };
}

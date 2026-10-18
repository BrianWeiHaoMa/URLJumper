// The one validation of a mapping's name, URL, and note that the Name form, the row editors, and the worker
// all call (G8, G14), so none of them can store or offer what another would refuse. Values are made
// well-formed first, a lone surrogate becoming U+FFFD as `chrome.storage.local` stores it. G8 checks the name
// once trimmed; the URL and the note are checked as given, so a line break at a note's edge is refused, and
// the note is written trimmed.
import { comparableName, hasScheme, type Mapping } from './grammar';

export interface MappingFields {
  name: string;
  url: string;
  /** Empty for no note. */
  note: string;
}

/** The rule a value breaks. A line break is LF or CR: a Text view turns a CR into LF, which would split the line. */
export type FieldProblem =
  | { field: 'name'; rule: 'empty' | 'backslash' | 'line-break' }
  | { field: 'url'; rule: 'whitespace' | 'backslash' | 'no-scheme' }
  | { field: 'note'; rule: 'backslash' | 'line-break' };

export type Validation =
  /** `fields` as the line will hold them: well-formed, the name and the note trimmed. */
  | { kind: 'valid'; fields: MappingFields }
  | ({ kind: 'invalid' } & FieldProblem)
  /** Another mapping line has the name, compared as the grammar compares names; `line` is its number. */
  | { kind: 'name-taken'; line: number };

const LINE_BREAK = /[\n\r]/;
const WHITESPACE = /\s/;

/** Checks `fields` against the rules and against `mappings`, the mapping lines whose names are taken. */
export function validateMapping(fields: MappingFields, mappings: readonly Mapping[]): Validation {
  const name = fields.name.toWellFormed().trim();
  const url = fields.url.toWellFormed();
  const note = fields.note.toWellFormed();
  const problem = nameProblem(name) ?? urlProblem(url) ?? noteProblem(note);
  if (problem) return { kind: 'invalid', ...problem };
  const holder = holderOfName(mappings, name);
  if (holder) return { kind: 'name-taken', line: holder.line };
  return { kind: 'valid', fields: { name, url, note: note.trim() } };
}

/** The mapping of `mappings` that already has `name`, compared as the grammar compares names; undefined when the name is free. */
export function holderOfName(mappings: readonly Mapping[], name: string): Mapping | undefined {
  const wanted = comparableName(name);
  return mappings.find((mapping) => comparableName(mapping.name) === wanted);
}

function nameProblem(name: string): FieldProblem | undefined {
  if (name === '') return { field: 'name', rule: 'empty' };
  if (name.includes('\\')) return { field: 'name', rule: 'backslash' };
  if (LINE_BREAK.test(name)) return { field: 'name', rule: 'line-break' };
  return undefined;
}

// A line break is whitespace, so the URL's whitespace rule covers it.
function urlProblem(url: string): FieldProblem | undefined {
  if (WHITESPACE.test(url)) return { field: 'url', rule: 'whitespace' };
  if (url.includes('\\')) return { field: 'url', rule: 'backslash' };
  if (!hasScheme(url)) return { field: 'url', rule: 'no-scheme' };
  return undefined;
}

function noteProblem(note: string): FieldProblem | undefined {
  if (note.includes('\\')) return { field: 'note', rule: 'backslash' };
  if (LINE_BREAK.test(note)) return { field: 'note', rule: 'line-break' };
  return undefined;
}

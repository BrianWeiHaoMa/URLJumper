// Rewriting one mapping line (G12, G13, G14, F12): the line found again by its anchor, the new values
// validated with every other mapping line's name taken, and the line written anew in its own columns with
// its own ending, so nothing else in the document changes. The worker stores what `rewriteMapping` returns,
// and a row editor asks `rewriteChecks`, which finds the line and checks the values as it does, what stops
// Save (How G8/G14: one validation).
import { findAnchor, type Anchor } from './anchor';
import { readDocument, type ReadLine } from './grammar';
import { replaceLine } from './line-edits';
import { formatRewrittenLine } from './line-format';
import { checkMapping, mappingsBesides, validateMapping, type MappingCheck, type MappingFields, type Validation } from './validation';

export type RewriteResult =
  /** `line` is where the line was found, and `text` the exact text written. */
  | { kind: 'applied'; document: string; line: number; text: string }
  /** No mapping line, or several, stands as `anchor` names it: the line changed or went since it was loaded. */
  | { kind: 'stale' }
  | Exclude<Validation, { kind: 'valid' }>;

/** `document` with the mapping line `anchor` names rewritten for `fields`, once they are valid against every other mapping line. */
export function rewriteMapping(document: string, anchor: Anchor, fields: MappingFields): RewriteResult {
  const { lines, mappings } = readDocument(document);
  const line = anchoredLine(lines, anchor);
  if (line === undefined) return { kind: 'stale' };
  const validation = validateMapping(fields, mappingsBesides(mappings, line.number));
  if (validation.kind !== 'valid') return validation;
  const text = formatRewrittenLine(line, validation.fields);
  return { kind: 'applied', document: replaceLine(lines, line.number, text), line: line.number, text };
}

/**
 * What a row editor shows against `fields` before Save (G8, G14): stale as `rewriteMapping` would answer it,
 * else where the line stands now and every problem `rewriteMapping` checks for, a value's and a taken name's
 * together, the anchor's own name free. Save goes through when both are null.
 */
export function rewriteChecks(document: string, anchor: Anchor, fields: MappingFields): { kind: 'stale' } | ({ kind: 'found'; line: number } & MappingCheck) {
  const { lines, mappings } = readDocument(document);
  const line = anchoredLine(lines, anchor);
  if (line === undefined) return { kind: 'stale' };
  return { kind: 'found', line: line.number, ...checkMapping(fields, mappingsBesides(mappings, line.number)) };
}

/** The mapping line `anchor` names in `lines`, found again as `findAnchor` finds it; undefined when it is not there. */
function anchoredLine(lines: readonly ReadLine[], anchor: Anchor): Extract<ReadLine, { kind: 'mapping' }> | undefined {
  const found = findAnchor(lines, anchor.line, anchor.text);
  const line = found === undefined ? undefined : lines[found - 1];
  return line?.kind === 'mapping' ? line : undefined;
}

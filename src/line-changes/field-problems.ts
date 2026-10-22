// What a form that writes one mapping line, the Name form or a row editor, says of the values it refuses, and of
// those the worker refuses when it checks them again (G8, G14, L2; How G8, G14): each problem names the line the
// values are for, and a taken name names the line that has it, with the offer to edit that line instead.
import type { Mapping } from '../document/grammar';
import type { FieldProblem } from '../document/validation';
import type { InsertReply } from '../requests';

/** Why `problem` blocks Save of the values for line `line`; `url` is the URL as typed, which tells a missing one from one without a scheme. */
export function fieldProblemText(problem: FieldProblem, line: number, url: string): string {
  if (problem.field === 'name') {
    if (problem.rule === 'empty') return `Line ${line} needs a name.`;
    if (problem.rule === 'backslash') return `Line ${line}: a name cannot contain a backslash (\\), which starts a comment.`;
    return `Line ${line}: a name cannot contain a line break.`;
  }
  if (problem.field === 'url') {
    if (problem.rule === 'whitespace') return `Line ${line}: a URL cannot contain spaces or other whitespace.`;
    if (problem.rule === 'backslash') return `Line ${line}: a URL cannot contain a backslash (\\), which starts a comment.`;
    return url === '' ? `Line ${line} needs a URL.` : `Line ${line}: a URL must begin with a scheme, such as https:`;
  }
  return `Line ${line}: a note cannot contain a line break.`;
}

/**
 * Why the worker refused to store the values for line `line`, an insert's or a rewrite's: a broken rule, or the
 * line that has the name; `url` as for `fieldProblemText`. Not Chrome's refusal (`storage-failed`): each form words that its own way.
 */
export function refusedValuesText(reply: Extract<InsertReply, { kind: 'invalid' | 'name-taken' }>, line: number, url: string): string {
  return reply.kind === 'name-taken' ? `Not saved: line ${reply.line} already has this name.` : `Not saved: ${fieldProblemText(reply, line, url)}`;
}

/** That `holder` already has the name (G8). */
export function takenNameText(holder: Mapping): string {
  return `Line ${holder.line} already has the name "${holder.name}".`;
}

/** The offer, beside a taken name, to edit the line that has it instead (G8). */
export function editInsteadText(holder: Mapping): string {
  return `Edit "${holder.name}" instead`;
}

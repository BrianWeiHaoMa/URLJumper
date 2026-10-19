// What a form that writes one mapping line, the Name form or a row editor, says of the values it refuses
// (G8, G14, L2): each problem names the line the values are for, and a taken name names the line that has it,
// with the offer to edit that line instead.
import type { Mapping } from '../document/grammar';
import type { FieldProblem } from '../document/validation';

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
  return problem.rule === 'backslash' ? `Line ${line}: a note cannot contain a backslash (\\).` : `Line ${line}: a note cannot contain a line break.`;
}

/** That `holder` already has the name (G8). */
export function takenNameText(holder: Mapping): string {
  return `Line ${holder.line} already has the name "${holder.name}".`;
}

/** The offer, beside a taken name, to edit the line that has it instead (G8). */
export function editInsteadText(holder: Mapping): string {
  return `Edit "${holder.name}" instead`;
}

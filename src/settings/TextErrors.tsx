// The Text view's list of errors (G17, L2): every line F4 cannot read, in line order, each naming its line;
// activating one, by Enter or a click, moves the caret to that line.
import type { DocumentError } from '../document/grammar';

interface TextErrorsProps {
  errors: readonly DocumentError[];
  /** Moves the caret to `line`. */
  onShow(line: number): void;
  /** Called with the line of the error that gains the focus, and with null as it loses it. */
  onFocusLine(line: number | null): void;
}

export function TextErrors({ errors, onShow, onFocusLine }: TextErrorsProps) {
  return (
    <ul className="text-errors" aria-label="Errors">
      {errors.map((error) => (
        <li key={error.line}>
          <button type="button" className="text-error" onClick={() => onShow(error.line)} onFocus={() => onFocusLine(error.line)} onBlur={() => onFocusLine(null)}>
            {errorText(error)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function errorText(error: DocumentError): string {
  switch (error.problem) {
    case 'needs-name-and-url':
      return `Line ${error.line}: expected a name and a URL`;
    case 'no-scheme':
      return `Line ${error.line}: expected a URL that begins with a scheme, such as https:`;
    case 'repeated-name':
      return `Line ${error.line}: expected a name of its own, but line ${error.heldBy} has this name`;
  }
}

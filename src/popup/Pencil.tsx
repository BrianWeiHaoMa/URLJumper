// The pencil (In use, "Edit from a suggestion"; G4, G10, G32): a button that opens one mapping's editor, named
// for that mapping, drawn inline so nothing loads from outside the package (R6). The window's pencils are
// drawn on their rows but stand outside the list in the document, after its rows, each a Tab stop in row
// order: a control inside a listbox, or beside its options, is one a screen reader cannot reach as such. They
// follow the window as it moves (G3, F13), and the Name row has none. A pencil opens the editor and nothing
// else: it sits over a row whose click jumps, but its click, Enter, and Space are its own (R4).
import type { SearchRow } from '../document/search';
import './pencil.css';

interface PencilProps {
  /** The mapping's name, which names the pencil. */
  name: string;
  /** While true, the pencil is offered but waits, as a form's actions do while its Save awaits a reply. */
  waiting?: boolean;
  onEdit(): void;
  onFocusChange(focused: boolean): void;
}

export function Pencil({ name, waiting = false, onEdit, onFocusChange }: PencilProps) {
  return (
    <button
      type="button"
      className="pencil"
      aria-label={`Edit "${name}"`}
      aria-disabled={waiting}
      onClick={() => {
        if (!waiting) onEdit();
      }}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M2.5 13.5 3.3 10.2 10.9 2.6a1.2 1.2 0 0 1 1.7 0l.8.8a1.2 1.2 0 0 1 0 1.7L5.8 12.7Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9.6 3.9 12.1 6.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  );
}

interface RowPencilsProps {
  /** The rows of the window, in order. */
  rows: readonly SearchRow[];
  /** Opens the editor of a listed mapping's line, with the argument row's argument, else none. */
  onEdit(line: number, argument: string | null): void;
  /** The key of the mapping whose pencil has the focus, or null when none has. */
  onFocusChange(key: string | null): void;
}

/** One slot per row of the window, as tall as the row, holding the row's pencil: every row but the Name row has one. */
export function RowPencils({ rows, onEdit, onFocusChange }: RowPencilsProps) {
  return (
    <div className="row-pencils">
      {rows.map((row) =>
        row.group === 'name' ? (
          <div key="name" className="row-pencil-slot" />
        ) : (
          // Keyed by the mapping, so a pencil whose mapping goes takes its focus with it instead of handing it
          // to the mapping that takes its place.
          <div key={row.mapping.key} className="row-pencil-slot">
            <Pencil
              name={row.mapping.name}
              onEdit={() => onEdit(row.mapping.line, row.group === 'argument' ? row.argument : null)}
              onFocusChange={(focused) => onFocusChange(focused ? row.mapping.key : null)}
            />
          </div>
        ),
      )}
    </div>
  );
}

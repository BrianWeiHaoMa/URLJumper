// The window's pencils (In use, "Edit from a suggestion"; G4, G32): one per listed mapping, each opening that
// mapping's editor. They are drawn on their rows but stand outside the list in the document, after its rows,
// each a Tab stop in row order: a control inside a listbox, or beside its options, is one a screen reader
// cannot reach as such. They follow the window as it moves (G3, F13), and the Name row has none. A pencil sits
// over a row whose click jumps, but its click, Enter, and Space are its own (R4).
import type { SearchRow } from '../document/search';
import { Pencil } from '../line-changes/Pencil';
import './row-pencils.css';

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

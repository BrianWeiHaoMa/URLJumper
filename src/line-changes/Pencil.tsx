// The pencil (In use, "Edit from a suggestion"; G10, G32): a button that opens one mapping's editor, named for
// that mapping, drawn inline so nothing loads from outside the package (R6). It opens the editor and nothing
// else: wherever it is drawn, its click, Enter, and Space are its own (R4). Search draws one on each row of
// the window (src/popup/RowPencils.tsx), and *This page is* one after the page's name.
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

// What the page is called (G10; How G10): the first mapping in document order whose URL equals the tab's
// address exactly, by name, with its pencil, which opens that line's editor; in search and in the Name form.
import type { Mapping } from '../document/grammar';
import { Pencil } from './Pencil';

interface ThisPageProps {
  mapping: Mapping;
  /** While true, the pencil waits, as the Name form's actions do while its Save awaits a reply. */
  waiting?: boolean;
  /** Opens the editor of the mapping's line. */
  onEdit(line: number): void;
  onFocusChange(focused: boolean): void;
}

export function ThisPage({ mapping, waiting, onEdit, onFocusChange }: ThisPageProps) {
  return (
    <p className="this-page">
      This page is "{mapping.name}"
      <Pencil name={mapping.name} waiting={waiting} onEdit={() => onEdit(mapping.line)} onFocusChange={onFocusChange} />
    </p>
  );
}

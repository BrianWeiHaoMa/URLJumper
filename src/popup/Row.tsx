// One row of the popup's list: the mapping's name and its URL, or for the argument row the URL filled with
// the argument (G1, G6). An argument alias listed without an argument shows each `%s` marked and a hint
// that Space and text fill it; an address match says so; the Name row offers to name the page with the
// typed text (G1 (f)). A long name or URL is shown from its start and cut with an ellipsis (G7).
import type { MouseEvent } from 'react';
import { argumentPieces, fillArgument, isArgumentAlias } from '../document/argument';
import type { SearchRow } from '../document/search';

const ARGUMENT_HINT = 'Space and text fill %s';

/** A row that lists a mapping: every row but the Name row. */
export type MappingRow = Exclude<SearchRow, { group: 'name' }>;

export function rowId(index: number): string {
  return `row-${index}`;
}

interface RowProps {
  row: SearchRow;
  /** The row's index in the whole list. */
  index: number;
  /** How many rows the whole list holds. */
  count: number;
  selected: boolean;
  onClick(event: MouseEvent): void;
}

export function Row({ row, index, count, selected, onClick }: RowProps) {
  return (
    <li
      id={rowId(index)}
      // A mapping row's name leaves room for its pencil, drawn over the row from outside the list (Pencil.tsx).
      className={row.group === 'name' ? 'row' : 'row has-pencil'}
      role="option"
      // The Name row's words are three boxes, which a screen reader would read with spaces between.
      aria-label={row.group === 'name' ? nameRowLabel(row.name) : undefined}
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={count}
      onClick={onClick}
    >
      {row.group === 'name' ? <NameRowText name={row.name} /> : <MappingRowText row={row} />}
    </li>
  );
}

/** A mapping row's name and URL as the list shows them; also above a row's editor. */
export function MappingRowText({ row }: { row: MappingRow }) {
  const name = row.mapping.name;
  // The list holds an argument row only when its URL can be filled.
  const url = row.group === 'argument' ? fillArgument(row.mapping.url, row.argument)! : row.mapping.url;
  const hinted = row.group !== 'argument' && isArgumentAlias(row.mapping.url);
  const address = row.group === 'address';
  return (
    <>
      <span className="row-line">
        {/* Its own direction, from its first letter, so a right-to-left name is cut at its end, not its start. */}
        <span className="row-name" dir="auto">
          {name}
        </span>
        {address && <span className="row-tag">address match</span>}
      </span>
      <span className="row-line">
        <span className="row-url">{hinted ? marked(url) : url}</span>
        {hinted && <span className="row-tag">{ARGUMENT_HINT}</span>}
      </span>
    </>
  );
}

const nameRowLabel = (name: string) => `Name "${name}" for this page`;

/** *Name "‹name›" for this page*, the typed name cut with an ellipsis when long and the words around it whole. */
function NameRowText({ name }: { name: string }) {
  return (
    <span className="row-line name-row-line">
      <span className="name-row-words">Name "</span>
      {/* Its own direction, as a mapping row's name has, so right-to-left text is cut at its end, not its start. */}
      <span className="name-row-name" dir="auto">
        {name}
      </span>
      <span className="name-row-words">" for this page</span>
    </span>
  );
}

/** The URL with each `%s` marked. */
function marked(url: string) {
  return argumentPieces(url).flatMap((piece, i) => (i === 0 ? [piece] : [<mark key={i} className="slot">%s</mark>, piece]));
}

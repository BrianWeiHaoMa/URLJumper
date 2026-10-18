// One row of the popup's list: the mapping's name and its URL, or for the argument row the URL filled with
// the argument (G1, G6). An argument alias listed without an argument shows each `%s` marked and a hint
// that Space and text fill it; an address match says so. A long name or URL is shown from its start and
// cut with an ellipsis (G7).
import type { MouseEvent } from 'react';
import { argumentPieces, fillArgument, isArgumentAlias } from '../document/argument';
import type { ListedRow } from './list-state';

const ARGUMENT_HINT = 'Space and text fill %s';

export function rowId(index: number): string {
  return `row-${index}`;
}

interface RowProps {
  row: ListedRow;
  /** The row's index in the whole list. */
  index: number;
  /** How many rows the whole list holds. */
  count: number;
  selected: boolean;
  onClick(event: MouseEvent): void;
}

export function Row({ row, index, count, selected, onClick }: RowProps) {
  const name = row.mapping.name;
  // The list holds an argument row only when its URL can be filled.
  const url = row.group === 'argument' ? fillArgument(row.mapping.url, row.argument)! : row.mapping.url;
  const hinted = row.group !== 'argument' && isArgumentAlias(row.mapping.url);
  const address = row.group === 'address';
  return (
    <li id={rowId(index)} className="row" role="option" aria-selected={selected} aria-posinset={index + 1} aria-setsize={count} onClick={onClick}>
      <span className="row-line">
        <span className="row-name">{name}</span>
        {address && <span className="row-tag">address match</span>}
      </span>
      <span className="row-line">
        <span className="row-url">{hinted ? marked(url) : url}</span>
        {hinted && <span className="row-tag">{ARGUMENT_HINT}</span>}
      </span>
    </li>
  );
}

/** The URL with each `%s` marked. */
function marked(url: string) {
  return argumentPieces(url).flatMap((piece, i) => (i === 0 ? [piece] : [<mark key={i} className="slot">%s</mark>, piece]));
}

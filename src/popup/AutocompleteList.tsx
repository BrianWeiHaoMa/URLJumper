import type { Mapping } from '../lib/parser';
import type { RankedAutocompleteEntry } from '../lib/autocompleteRank';

type Props = {
  suggestions: RankedAutocompleteEntry[];
  activeIndex: number;
  onSelect: (mapping: Mapping) => void;
  onEdit: (mapping: Mapping) => void;
  hiddenAbove?: number;
  hiddenBelow?: number;
};

export function AutocompleteList({
  suggestions,
  activeIndex,
  onSelect,
  onEdit,
  hiddenAbove = 0,
  hiddenBelow = 0,
}: Props) {
  return (
    <div>
      <ul className="suggestions" role="listbox" aria-label="Matching aliases">
        {suggestions.map((row, i) => {
          const m = row.mapping;
          const classes = [
            i === activeIndex ? 'active' : '',
            i === 0 ? 'pinned' : '',
            i === 1 && hiddenAbove > 0 ? 'gap-above' : '',
            row.matchKind === 'partial' ? 'partial-match' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li
              key={`${m.line}-${m.name}`}
              role="option"
              aria-selected={i === activeIndex}
              className={classes || undefined}
              data-urljumper-suggestion-slot={i}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(m);
              }}
            >
              <span className="suggestion-main">
                <span className="alias">{m.name}</span>
                <span className="url">{m.url}</span>
              </span>
              <button
                type="button"
                className="suggestion-edit-button"
                title={`Edit ${m.name}`}
                aria-label={`Edit ${m.name}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(m);
                }}
              >
                ✎
              </button>
            </li>
          );
        })}
      </ul>
      {hiddenBelow > 0 && (
        <div className="overflow-hint below" aria-hidden>
          +{hiddenBelow} more below — &darr; or scroll wheel
        </div>
      )}
      {hiddenAbove > 0 && hiddenBelow === 0 && (
        <div className="overflow-hint above" aria-hidden>
          +{hiddenAbove} hidden above — &uarr; or scroll wheel
        </div>
      )}
    </div>
  );
}

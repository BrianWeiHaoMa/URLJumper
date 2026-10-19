// The Name form's Section choice (G9, P2): *End of document* and every heading, one option each, chosen with
// the arrow keys or a click. A list rather than a native select, which cuts a long option's text (G7), or a
// radio group, whose unchecked members Tab never reaches; each heading's text wraps and is shown whole.
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

export interface SectionOption {
  /** Stable across redraws: `end`, or the heading's first line number. */
  key: string;
  label: string;
}

interface SectionChoiceProps {
  options: readonly SectionOption[];
  /** The chosen option's index; null when the chosen heading is no longer in the document. */
  chosen: number | null;
  onChoose(index: number): void;
}

const optionId = (index: number) => `section-${index}`;

export function SectionChoice({ options, chosen, onChoose }: SectionChoiceProps) {
  // The option chosen with a key is scrolled into view; nothing scrolls when the form appears.
  const moved = useRef(false);
  useLayoutEffect(() => {
    if (!moved.current || chosen === null) return;
    moved.current = false;
    document.getElementById(optionId(chosen))?.scrollIntoView({ block: 'nearest' });
  }, [chosen]);

  const onKeyDown = (event: KeyboardEvent) => {
    const last = options.length - 1;
    const from = chosen ?? -1;
    const to = { ArrowDown: Math.min(from + 1, last), ArrowUp: Math.max(from - 1, 0), Home: 0, End: last }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    moved.current = true;
    onChoose(to);
  };

  return (
    <div className="field">
      <span className="field-label" id="section-label">
        Section
      </span>
      <ul
        className="sections"
        role="listbox"
        tabIndex={0}
        aria-labelledby="section-label"
        aria-activedescendant={chosen === null ? undefined : optionId(chosen)}
        onKeyDown={onKeyDown}
      >
        {options.map((option, index) => (
          <li key={option.key} id={optionId(index)} className="section" role="option" aria-selected={index === chosen} onClick={() => onChoose(index)}>
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

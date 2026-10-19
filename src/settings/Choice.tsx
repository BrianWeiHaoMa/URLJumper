// A choice of one value among a few (F15's preferences), shown as a row of options: chosen with the arrow keys,
// Home, End, or a click, and stored as it is chosen. A listbox, as the Name form's Section choice is, rather
// than radio buttons, whose unchecked members Tab never reaches; Enter on it does nothing (L2).
import { useId, type KeyboardEvent } from 'react';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

interface ChoiceProps<T extends string> {
  /** The id of the heading that says what is chosen, which names the choice for a screen reader (G32). */
  labelledBy: string;
  options: readonly ChoiceOption<T>[];
  /** The value chosen now, as stored; undefined until it has been read. */
  chosen: T | undefined;
  onChoose(value: T): void;
  onFocusChange(focused: boolean): void;
}

export function Choice<T extends string>({ labelledBy, options, chosen, onChoose, onFocusChange }: ChoiceProps<T>) {
  const id = useId();
  const optionId = (index: number) => `${id}-${index}`;
  const index = options.findIndex((option) => option.value === chosen);

  const onKeyDown = (event: KeyboardEvent) => {
    const last = options.length - 1;
    const to = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: last }[event.key];
    if (to === undefined) return;
    // The arrow keys move nothing else, the page's scroll included.
    event.preventDefault();
    if (chosen !== undefined && to >= 0 && to <= last && to !== index) onChoose(options[to]!.value);
  };

  return (
    <ul
        className="choice"
        role="listbox"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-orientation="horizontal"
        aria-activedescendant={index < 0 ? undefined : optionId(index)}
        onKeyDown={onKeyDown}
        onFocus={() => onFocusChange(true)}
        onBlur={() => onFocusChange(false)}
      >
        {options.map((option, i) => (
          <li
            key={option.value}
            id={optionId(i)}
            className="choice-option"
            role="option"
            aria-selected={i === index}
            onClick={() => {
              if (chosen !== undefined && i !== index) onChoose(option.value);
            }}
          >
            {option.label}
          </li>
        ))}
      </ul>
  );
}

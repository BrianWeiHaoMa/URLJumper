// A field of a form that writes one mapping line, the Name form or the row editor (G7, G31, G32, L2): its label,
// the name, URL, or note, and at the field's far right its copy button, which puts the value as it stands on the
// clipboard, typed or not, whatever its problem, storing and opening nothing. The button stands outside the
// label, so the field's name is the label alone. The form that draws the field says what a copy came to.
import { useId, useRef, type RefObject } from 'react';
import type { MappingFields } from '../document/validation';
import { chromeMessage } from '../requests';
import { useFieldLine } from './field-line';

export type FieldName = keyof MappingFields;

const LABEL: Record<FieldName, string> = { name: 'Name', url: 'URL', note: 'Note' };
const WORD: Record<FieldName, string> = { name: 'name', url: 'URL', note: 'note' };
const COPY_ICON = 'M5.5 10.5H4A1.5 1.5 0 0 1 2.5 9V4A1.5 1.5 0 0 1 4 2.5h5A1.5 1.5 0 0 1 10.5 4v1.5M7 5.5h5A1.5 1.5 0 0 1 13.5 7v5a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 12V7A1.5 1.5 0 0 1 7 5.5Z';

interface MappingFieldProps {
  field: FieldName;
  value: string;
  invalid: boolean;
  /** The id of the form's problem, which describes every field. */
  describedBy: string;
  /** The field takes no typing, while a change awaits its reply (G21). */
  readOnly?: boolean;
  /** The copy button is offered but waits, while a change awaits its reply (G21). */
  waiting: boolean;
  input?: RefObject<HTMLInputElement | null>;
  onChange(value: string): void;
  /** Called inside the user's click or key, which the clipboard needs (S14). */
  onCopy(field: FieldName): void;
  /** Called with the field as its copy button gains the focus, and with null as it loses it. */
  onCopyFocus?(field: FieldName | null): void;
}

export function MappingField({ field, value, invalid, describedBy, readOnly, waiting, input, onChange, onCopy, onCopyFocus }: MappingFieldProps) {
  const id = useId();
  const own = useRef<HTMLInputElement>(null);
  const element = input ?? own;
  const url = field === 'url';
  const copy = `Copy ${WORD[field]}`;
  useFieldLine(element);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {LABEL[field]}
      </label>
      <div className="field-value">
        <input
          ref={element}
          id={id}
          className={url ? 'field-input field-url' : 'field-input'}
          type="text"
          inputMode={url ? 'url' : undefined}
          autoComplete="off"
          autoCapitalize={url ? 'off' : undefined}
          spellCheck={false}
          readOnly={readOnly}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="form-button field-copy"
          data-control={`copy-${field}`}
          aria-label={copy}
          title={copy}
          aria-disabled={waiting}
          onClick={() => onCopy(field)}
          onFocus={() => onCopyFocus?.(field)}
          onBlur={() => onCopyFocus?.(null)}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d={COPY_ICON} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** What Enter does with the focus on `field`'s copy button (L2). */
export function copySays(field: FieldName): string {
  return `Enter copies the ${WORD[field]}`;
}

/** What a copy came to, or what a form's last action came to when it stored nothing. */
export interface Said {
  text: string;
  alert: boolean;
}

/** Puts `value`, `field`'s as it stands, on the clipboard, saying what came of it. */
export function copyField(field: FieldName, value: string, say: (said: Said | null) => void) {
  copyText(value, `Copied the ${WORD[field]}`, say);
}

/** Puts `text` on the clipboard (G31), saying `copied`, or Chrome's message when it refuses. */
export function copyText(text: string, copied: string, say: (said: Said | null) => void) {
  say(null);
  navigator.clipboard.writeText(text).then(
    () => say({ text: copied, alert: false }),
    (error: unknown) => say({ text: `Not copied. Chrome said: ${chromeMessage(error)}`, alert: true }),
  );
}

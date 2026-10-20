// The Text view's question before a switch to the List view over unsaved changes (G19; In use, "Edit the
// text"; L2): save the text and switch, which switches only once the Save stores it; keep the text as the draft
// and switch; or stay. It takes the focus as it is shown, and the text area takes no typing until the user
// answers, since the answers are about the text as it was asked. *Save and switch* waits whenever the view's
// own Save would, and says why.
import { useEffect, useId, useRef, useState } from 'react';

interface SwitchQuestionProps {
  /** What Enter does on the view's Save while it waits, which *Save and switch* says; null while it can save. */
  saveWaits: string | null;
  onSave(): void;
  onKeep(): void;
  onStay(): void;
  /** Called with what Enter does on the question's control that gains the focus, and with null as it loses it. */
  onSayEnter(text: string | null): void;
}

export function SwitchQuestion({ saveWaits, onSave, onKeep, onStay, onSayEnter }: SwitchQuestionProps) {
  const id = useId();
  const first = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState<0 | 1 | 2 | null>(null);
  const answers = [
    ['Save and switch', onSave, saveWaits ?? 'Enter saves the text and shows the List view'],
    ['Keep the draft and switch', onKeep, 'Enter keeps the unsaved text for later and shows the List view'],
    ['Stay', onStay, 'Enter stays in the Text view'],
  ] as const;

  useEffect(() => first.current?.focus(), []);
  const enter = focused === null ? null : answers[focused][2];
  useEffect(() => onSayEnter(enter), [enter, onSayEnter]);
  // Answered, the question goes, and with it what it said.
  useEffect(() => () => onSayEnter(null), [onSayEnter]);

  return (
    <section className="switch-question" aria-labelledby={`${id}-heading`}>
      <h2 className="settings-heading" id={`${id}-heading`}>
        Switch to List with unsaved text?
      </h2>
      <p className="settings-text">
        The text has changes that are not saved. Save it and show the List view, keep it unsaved for a Text view to offer back, or stay here.
      </p>
      <div className="settings-action">
        {answers.map(([label, onAnswer], at) => (
          <button
            key={label}
            ref={at === 0 ? first : undefined}
            type="button"
            className="settings-button"
            aria-disabled={at === 0 && saveWaits !== null}
            onClick={onAnswer}
            onFocus={() => setFocused(at as 0 | 1 | 2)}
            onBlur={() => setFocused(null)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

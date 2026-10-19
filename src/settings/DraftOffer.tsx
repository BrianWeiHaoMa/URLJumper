// The Text view's offer of a kept draft as it opens (G19; In use, "Edit the text"; L2): unsaved text a Text
// view kept, which this view offers back to resume, its text and its base restored, or to discard; or, when
// Import's file waits, asks whether to replace it with the file or keep it. It takes the focus as it is shown,
// and the text area takes no typing until the user answers.
import { useEffect, useId, useRef, useState } from 'react';
import { typedAt, type Draft } from '../draft';

interface DraftOfferProps {
  draft: Draft;
  /** The name of the file Import read, when it waits on the answer; null for the offer to resume or discard. */
  importing: string | null;
  /** Whether the stored document has changed since the draft was typed against it. */
  changedSince: boolean;
  /** What Chrome said when the draft was not discarded. */
  failure: string | null;
  onResume(): void;
  onDiscard(): void;
  onReplace(): void;
  onKeep(): void;
  /** Called with what Enter does on the offer's control that gains the focus, and with null as it loses it. */
  onSayEnter(text: string | null): void;
}

export function DraftOffer({ draft, importing, changedSince, failure, onResume, onDiscard, onReplace, onKeep, onSayEnter }: DraftOfferProps) {
  const id = useId();
  const first = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState<0 | 1 | null>(null);
  const answers =
    importing === null
      ? ([
          ['Resume', onResume, 'Enter resumes the unsaved text'],
          ['Discard', onDiscard, 'Enter discards the unsaved text'],
        ] as const)
      : ([
          ['Replace it with the file', onReplace, 'Enter replaces the unsaved text with the file'],
          ['Keep the unsaved text', onKeep, 'Enter keeps the unsaved text and imports nothing'],
        ] as const);

  useEffect(() => first.current?.focus(), []);
  const enter = focused === null ? null : answers[focused][2];
  useEffect(() => onSayEnter(enter), [enter, onSayEnter]);
  // Answered or withdrawn, the offer goes, and with it what it said.
  useEffect(() => () => onSayEnter(null), [onSayEnter]);

  return (
    <section className="draft-offer" aria-labelledby={`${id}-heading`}>
      <h2 className="settings-heading" id={`${id}-heading`}>
        Unsaved text kept
      </h2>
      <p className="settings-text">
        Text typed in a Text view at {typedAt(draft)} was not saved.
        {importing === null ? ' Resume it to go on editing it, or discard it.' : ` Importing ${importing} replaces it.`}
        {changedSince && ' The stored document has changed since it was typed: Save then offers to bring that change in.'}
      </p>
      {failure !== null && (
        <p className="settings-alert" role="alert">
          Not discarded. Chrome said: {failure}
        </p>
      )}
      <div className="settings-action">
        {answers.map(([label, onAnswer], at) => (
          <button
            key={label}
            ref={at === 0 ? first : undefined}
            type="button"
            className="settings-button"
            onClick={onAnswer}
            onFocus={() => setFocused(at as 0 | 1)}
            onBlur={() => setFocused(null)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

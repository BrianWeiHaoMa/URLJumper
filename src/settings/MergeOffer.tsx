// The Text view's offer after a Save refused because the stored document changed (G18; In use, "Edit the text";
// L2): the merge of the text submitted with the stored document, from the document module, brought into the
// text area with one action. Each part both changed differently is shown in the stored document's version and
// the text's, with where each is in its own text; none is chosen in advance, so no change of either side is
// dropped on a keypress, and the action brings nothing in until every part has a version.
import { useEffect, useId, useRef, useState } from 'react';
import { mergedText, type MergePart, type MergeSide, type MergeVersion } from '../document/merge';

interface MergeOfferProps {
  parts: readonly MergePart[];
  /** Brings `text`, the merge with the versions chosen, into the text area. */
  onBringIn(text: string): void;
  /** Called with what Enter does on the offer's control that gains the focus, and with null as the offer loses it. */
  onSayEnter(text: string | null): void;
}

type Focused = { conflict: number; side: MergeSide } | 'bring-in' | null;

const SIDES = ['stored', 'submitted'] as const;

export function MergeOffer({ parts, onBringIn, onSayEnter }: MergeOfferProps) {
  const id = useId();
  const conflicts = parts.flatMap((part) => (part.kind === 'conflict' ? [part] : []));
  const [choices, setChoices] = useState<readonly (MergeSide | undefined)[]>(() => conflicts.map(() => undefined));
  const [missingShown, setMissingShown] = useState(false);
  const [focused, setFocused] = useState<Focused>(null);
  const firstControl = useRef<HTMLButtonElement>(null);
  const left = choices.filter((choice) => choice === undefined).length;

  // The offer takes the focus as it is shown: the text area is read-only until the change is brought in.
  useEffect(() => firstControl.current?.focus(), []);

  const enter =
    focused === null
      ? null
      : focused === 'bring-in'
        ? left === 0
          ? 'Enter brings the change into your text'
          : `Enter does nothing · ${missingText(left)}`
        : focused.side === 'stored'
          ? "Enter keeps the stored document's version"
          : 'Enter keeps your version';
  useEffect(() => onSayEnter(enter), [enter, onSayEnter]);
  // Brought in, the offer goes, and with it what it said.
  useEffect(() => () => onSayEnter(null), [onSayEnter]);

  const choose = (conflict: number, side: MergeSide) => setChoices((chosen) => chosen.map((choice, at) => (at === conflict ? side : choice)));

  const bringIn = () => {
    if (left > 0) setMissingShown(true);
    else onBringIn(mergedText(parts, choices as readonly MergeSide[]));
  };

  return (
    <section className="merge-offer" aria-labelledby={`${id}-heading`}>
      <h2 className="settings-heading" id={`${id}-heading`}>
        Bring in the stored document&apos;s change
      </h2>
      <p className="settings-text">
        Its changes to lines you did not change go into your text, and your changes stay.
        {conflicts.length === 1 && ' One part was changed both there and in your text: choose the version to keep.'}
        {conflicts.length > 1 && ` ${conflicts.length} parts were changed both there and in your text: choose the version of each to keep.`} Nothing is
        stored until you save.
      </p>
      {conflicts.map((conflict, at) => (
        <div key={at} className="merge-conflict" role="group" aria-labelledby={`${id}-${at}`}>
          <h3 className="merge-conflict-heading" id={`${id}-${at}`}>
            Changed in both, {at + 1} of {conflicts.length}
          </h3>
          {SIDES.map((side) => (
            <button
              key={side}
              ref={at === 0 && side === 'stored' ? firstControl : undefined}
              type="button"
              className="merge-version"
              aria-pressed={choices[at] === side}
              onClick={() => choose(at, side)}
              onFocus={() => setFocused({ conflict: at, side })}
              onBlur={() => setFocused(null)}
            >
              <span className="merge-version-label">
                {versionLabel(side, conflict[side])}
                {choices[at] === side && <span aria-hidden="true"> · Chosen</span>}
              </span>
              {conflict[side].lines.length === 0 ? (
                <span className="merge-version-none">No lines: this part removed</span>
              ) : (
                <span className="merge-lines">
                  {conflict[side].lines.map((line, number) => (
                    <span key={number} className="merge-line">
                      {line}
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      {missingShown && left > 0 && (
        <p className="settings-alert" role="alert">
          {missingText(left)}.
        </p>
      )}
      <div className="settings-action">
        <button
          ref={conflicts.length === 0 ? firstControl : undefined}
          type="button"
          className="settings-button"
          aria-disabled={left > 0}
          onClick={bringIn}
          onFocus={() => setFocused('bring-in')}
          onBlur={() => setFocused(null)}
        >
          Bring in the change
        </button>
      </div>
    </section>
  );
}

/** Which version, and where its lines are in its own text, or where they would be when it has none. */
function versionLabel(side: MergeSide, version: MergeVersion): string {
  const whose = side === 'stored' ? 'Stored document' : 'Your text';
  const count = version.lines.length;
  if (count === 0) return version.line === 1 ? `${whose}, at the start` : `${whose}, after line ${version.line - 1}`;
  return count === 1 ? `${whose}, line ${version.line}` : `${whose}, lines ${version.line} to ${version.line + count - 1}`;
}

function missingText(left: number): string {
  return left === 1 ? 'Choose a version of 1 more part changed in both' : `Choose a version of ${left} more parts changed in both`;
}

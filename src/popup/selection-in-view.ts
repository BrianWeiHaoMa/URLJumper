// The selected row is always visible (G3). Search's view scrolls wherever the user or the focus takes it (G7,
// G32), and nothing here scrolls it back; instead its selection is shown (drawn, and named by the search box
// as its active row) and acted on by Enter, Shift+Enter, and Ctrl+E (G4, G5, P1) only while its row is
// visible in the view. A selection whose row the view leaves is held back, not moved: the row the user chose
// is the one shown again once it is back in view, and no key acts on a row they cannot see. Up, Down, a new
// list, and the search box's focus bring the selected row into view (`bringIntoView`).
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { rowId } from './Row';

/** Layout rounds: an edge within half a pixel of the view's is on it. */
const ROUNDING = 0.5;

interface Edges {
  top: number;
  bottom: number;
}

/** Whether a box is visible in a view: whole inside it, or, taller than the view so that nothing can show it whole, filling it. */
export function visibleIn(box: Edges, view: Edges): boolean {
  const whole = box.top >= view.top - ROUNDING && box.bottom <= view.bottom + ROUNDING;
  const fills = box.top <= view.top + ROUNDING && box.bottom >= view.bottom - ROUNDING;
  return whole || fills;
}

export interface SelectionInView {
  /** The selected row while its row is visible in the view, as last read; else null. What is drawn and named as selected. */
  shown: number | null;
  /** The selected row if its row is visible in the view now, read from the layout at the call; else null. What a key acts on. */
  actedOn(): number | null;
  /**
   * Scrolls the view only as far as it takes to show the selected row, and shows it. The focus, if this leaves
   * the control in the view that has it out of view, goes to `focusBack` (G32).
   */
  bringIntoView(): void;
}

/**
 * Search's selection, `selected` (an index into the list, its row drawn with `rowId`), shown only while its
 * row is visible in `view`: read after every render, at every scroll of the view and change of its size, and
 * at each key, since a scroll lands frames after the key that asked for it.
 */
export function useSelectionInView(view: RefObject<HTMLElement | null>, selected: number | null, focusBack: RefObject<HTMLElement | null>): SelectionInView {
  const [visible, setVisible] = useState(true);
  const latest = useRef(selected);
  latest.current = selected;

  const read = useCallback(() => {
    const row = latest.current === null ? null : document.getElementById(rowId(latest.current));
    const area = view.current;
    const now = row !== null && area !== null && area.contains(row) && visibleIn(row.getBoundingClientRect(), area.getBoundingClientRect());
    setVisible(now);
    return now;
  }, [view]);

  // The view is drawn afresh each time search is shown again: its listeners follow the element.
  const watched = useRef<{ area: HTMLElement; stop(): void }>(undefined);
  useLayoutEffect(() => {
    const area = view.current;
    if (watched.current?.area !== area) {
      watched.current?.stop();
      watched.current = area === null ? undefined : watch(area, read);
    }
    read();
  });
  useLayoutEffect(
    () => () => {
      watched.current?.stop();
      watched.current = undefined;
    },
    [],
  );

  return {
    shown: visible ? selected : null,
    actedOn: () => (read() ? latest.current : null),
    bringIntoView: () => {
      const row = latest.current === null ? null : document.getElementById(rowId(latest.current));
      const area = view.current;
      if (row === null || area === null) return;
      row.scrollIntoView({ block: 'nearest' });
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== area && area.contains(focused) && !visibleIn(focused.getBoundingClientRect(), area.getBoundingClientRect())) {
        focusBack.current?.focus();
      }
      read();
    },
  };
}

/** Calls `read` at every scroll of `area` and change of its size; the function returned stops. */
function watch(area: HTMLElement, read: () => void) {
  const observer = new ResizeObserver(() => read());
  observer.observe(area);
  area.addEventListener('scroll', read, { passive: true });
  return {
    area,
    stop: () => {
      observer.disconnect();
      area.removeEventListener('scroll', read);
    },
  };
}

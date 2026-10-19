// Keeping the popup inside Chrome's popup size limit (G7). Chrome sizes the popup to its content up to 600
// device-independent pixels (S6), and CSS pixels need not equal those, so when the content is taller than
// the viewport Chrome gave, the root takes the viewport's height: the header and footer stay in view and the
// view between them scrolls. While it scrolls, the view takes Tab focus so the keyboard can scroll it too,
// which Chrome does not give a scrolling element of its own before version 130.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export function useFitToViewport() {
  const root = useRef<HTMLElement>(null);
  const view = useRef<HTMLDivElement>(null);

  const fit = useCallback(() => {
    const main = root.current;
    if (main === null) return;
    // Unset, the root's height lets the view grow to its content, which drops the view's scroll: a redraw, as
    // the focus moving to a control the view scrolled to makes, would scroll that control out of sight.
    const scrolled = view.current?.scrollTop ?? 0;
    // Measured at the content's own height: reading layout lets Chrome size the popup to the content, up to
    // its limit, before the viewport is compared, so a popup that can still grow does.
    main.style.height = '';
    if (document.documentElement.scrollHeight > window.innerHeight) main.style.height = `${window.innerHeight}px`;
    if (view.current) {
      view.current.tabIndex = view.current.scrollHeight > view.current.clientHeight ? 0 : -1;
      view.current.scrollTop = scrolled;
    }
  }, []);

  // After every render, and whenever the viewport or the view's content changes size without one.
  useLayoutEffect(fit);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);
  // The content is watched from whenever it is drawn, also when a view is shown again.
  const content = useCallback(
    (element: HTMLDivElement) => {
      const observer = new ResizeObserver(fit);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [fit],
  );

  return { root, view, content };
}

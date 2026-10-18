// Keeping the popup inside Chrome's popup size limit (G7). Chrome sizes the popup to its content up to 600
// device-independent pixels (S6), and CSS pixels need not equal those, so when the content is taller than
// the viewport Chrome gave, the root takes the viewport's height: the header and footer stay in view and the
// view between them scrolls. While it scrolls, the view takes Tab focus so the keyboard can scroll it too,
// which Chrome does not give a scrolling element of its own before version 130.
import { useEffect, useLayoutEffect, useRef } from 'react';

export function useFitToViewport() {
  const root = useRef<HTMLElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  const fit = () => {
    const main = root.current;
    if (main === null) return;
    // Measured at the content's own height: reading layout lets Chrome size the popup to the content, up to
    // its limit, before the viewport is compared, so a popup that can still grow does.
    main.style.height = '';
    if (document.documentElement.scrollHeight > window.innerHeight) main.style.height = `${window.innerHeight}px`;
    if (view.current) view.current.tabIndex = view.current.scrollHeight > view.current.clientHeight ? 0 : -1;
  };

  // After every render, and whenever the viewport or the view's content changes size without one.
  useLayoutEffect(fit);
  useEffect(() => {
    const observer = new ResizeObserver(fit);
    if (content.current) observer.observe(content.current);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  return { root, view, content };
}

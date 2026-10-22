// The icons more than one view draws, inline so nothing loads from outside the package (R6), and the square
// button a header holds one in (src/icons.css). A button drawn as an icon has its action as its accessible name
// and, for the pointer, as its title. The plus is *Name this page* in search and *Add mapping* in the List view.
import './icons.css';

export function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M8 2.5v11M2.5 8h11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

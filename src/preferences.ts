// The preferences as stored (F3, F15; State): the search order and the theme, read the same way by every
// surface. Only Preferences writes them.
import type { SearchOrder } from './document/search';

/** `searchOrder` as stored: `smart` is Smart order; absence, and anything else, is Document order, the order 1.x had (G23). */
export function readSearchOrder(value: unknown): SearchOrder {
  return value === 'smart' ? 'smart' : 'document';
}

export type Theme = 'system' | 'light' | 'dark';

/** `themePref` as stored: `light` or `dark`; absence, and anything else, is System (F3). */
export function readTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Shows `theme` on this page. `src/theme.css` follows the system's color scheme, live, unless the root names one. */
export function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

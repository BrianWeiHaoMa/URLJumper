// The preferences as stored (F3, F15; State): the search order and the theme, read the same way by every
// surface. Only Preferences writes them, and only when the user chooses: a read never stores what it found.
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

/** Stores the search order the user chose. Rejects as Chrome's `set` does, storing nothing. */
export function storeSearchOrder(order: SearchOrder): Promise<void> {
  return chrome.storage.local.set({ searchOrder: order });
}

/** Stores the theme the user chose: `light` or `dark`, and System as no key, which is what System is (F3). Rejects as Chrome does. */
export function storeTheme(theme: Theme): Promise<void> {
  return theme === 'system' ? chrome.storage.local.remove('themePref') : chrome.storage.local.set({ themePref: theme });
}

/** Shows the stored theme on this page now and after every change to it; the function returned stops following it. */
export function followStoredTheme(): () => void {
  const read = () => void chrome.storage.local.get('themePref').then(({ themePref }) => applyTheme(readTheme(themePref)));
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === 'local' && 'themePref' in changes) read();
  };
  chrome.storage.onChanged.addListener(changed);
  read();
  return () => chrome.storage.onChanged.removeListener(changed);
}

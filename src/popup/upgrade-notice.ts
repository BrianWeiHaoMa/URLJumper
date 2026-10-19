// The upgrade notice's rules (G25, L2), pure, for `UpgradeNotice.tsx` and the views that show it: which
// keystrokes dismiss it, which of them activate its control instead, and what the footer says while it shows.

/** The notice's two controls: the one that opens what's new, and its close control. */
export type NoticeControl = 'open' | 'close';

/**
 * Keys held to modify another key's keystroke. Pressed on its own one is no keystroke yet: it is part of the
 * keystroke it modifies, as Shift is of a typed capital, so the Shift of Shift+Tab never dismisses.
 */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'Fn', 'Hyper', 'Super', 'Symbol']);

/**
 * Whether a keystroke dismisses the notice (G25): every keystroke but Tab and Shift+Tab, which move the focus
 * to and from the notice so the keyboard can reach and activate it (G32).
 */
export function dismissesNotice(key: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>): boolean {
  if (MODIFIERS.has(key.key)) return false;
  return !(key.key === 'Tab' && !key.ctrlKey && !key.altKey && !key.metaKey);
}

/** Whether a keystroke on one of the notice's controls activates that control: Enter or Space, as on any button. */
export function activatesControl(key: Pick<KeyboardEvent, 'key'>): boolean {
  return key.key === 'Enter' || key.key === ' ';
}

const ENTER_ON: Record<NoticeControl, string> = {
  open: "Enter opens what's new in a new tab",
  close: 'Enter closes the notice',
};

/**
 * The footer of a view that shows the notice (L2). With the focus on one of its controls, what Enter does
 * there; otherwise the view's own footer, except that while the notice shows, Enter that would do nothing
 * dismisses it, as every keystroke does, so the footer says so.
 */
export function footerWithNotice(viewFooter: string, notice: { shown: boolean; focused: NoticeControl | null }): string {
  if (!notice.shown) return viewFooter;
  if (notice.focused !== null) return ENTER_ON[notice.focused];
  return viewFooter.replace('Enter does nothing', 'Enter only closes the notice');
}

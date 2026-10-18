// The keyboard commands (F5): `open-new-tab` and `open-same-tab` open the popup, in New tab and This tab
// mode, for the window the command was pressed in. `name-this-page` opens the Name form, which the popup
// does not have yet, so it opens nothing rather than the popup in a mode nobody asked for.
import type { OpenIntentKind } from '../open-intent';
import { openPopupFor } from './open-popup';

const INTENTS: Readonly<Record<string, OpenIntentKind>> = { 'open-new-tab': 'new-tab', 'open-same-tab': 'this-tab' };

export async function runCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  const kind = INTENTS[command];
  if (kind === undefined) return;
  // Chrome may pass no tab; the command was then pressed in the focused window.
  const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused().catch(() => undefined))?.id;
  if (windowId !== undefined) await openPopupFor(kind, windowId);
}

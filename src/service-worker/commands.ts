// The keyboard commands (F5): `open-new-tab` and `open-same-tab` open the popup in New tab and This tab
// mode, and `name-this-page` opens it on the Name form for the page, in the window the command was pressed in.
import type { OpenIntentKind } from '../open-intent';
import { openPopupFor, windowOf } from './open-popup';

const INTENTS: Readonly<Record<string, Exclude<OpenIntentKind, 'name-link'>>> = {
  'open-new-tab': 'new-tab',
  'open-same-tab': 'this-tab',
  'name-this-page': 'name-page',
};

export async function runCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  const kind = INTENTS[command];
  if (kind === undefined) return;
  const windowId = await windowOf(tab);
  if (windowId !== undefined) await openPopupFor({ kind }, windowId);
}

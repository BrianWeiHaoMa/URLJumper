// Opening the popup for a command (G5): the intent record first, so the popup knows why it opened, then
// Chrome's openPopup. Refused for an inactive window, the record stays and the popup opens when that window
// next takes focus while the record is fresh; refused for any other reason, the record goes and nothing opens.
import { isFresh, isOpenIntent, sameIntent, type OpenIntent, type OpenIntentKind } from '../open-intent';
import { chromeMessage } from '../requests';
import { enqueue } from './queue';

// Chrome's kOpenPopupInactiveWindow, the same from Chrome 127 on.
const INACTIVE_WINDOW = 'Cannot show popup for an inactive window.';

export async function openPopupFor(kind: OpenIntentKind, windowId: number): Promise<void> {
  const intent: OpenIntent = { kind, windowId, time: Date.now() };
  try {
    await enqueue(() => chrome.storage.local.set({ openIntent: intent }));
  } catch {
    // Without its record the popup would start in New tab mode, the wrong one for This tab: open nothing.
    return;
  }
  await showPopup(intent);
}

/** Opens the popup a fresh record still waits on, when its window takes focus. The record is read from
 *  storage, since the worker's memory may not have survived since it was written. */
export async function reopenPopupOnFocus(windowId: number): Promise<void> {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const { openIntent } = await chrome.storage.local.get('openIntent');
  if (isOpenIntent(openIntent) && openIntent.windowId === windowId && isFresh(openIntent, Date.now())) {
    await showPopup(openIntent);
  }
}

async function showPopup(intent: OpenIntent): Promise<void> {
  try {
    await chrome.action.openPopup({ windowId: intent.windowId });
  } catch (error) {
    if (chromeMessage(error).startsWith(INACTIVE_WINDOW)) return;
    await enqueue(() => removeIntent(intent));
  }
}

// Removes the record only while it is still this one. The record's write and this read-then-remove both run
// on the worker's queue, so a later command's record cannot land between them; the opening itself stays off
// the queue, so no jump waits on Chrome's popup.
async function removeIntent(intent: OpenIntent): Promise<void> {
  const { openIntent } = await chrome.storage.local.get('openIntent');
  if (isOpenIntent(openIntent) && sameIntent(openIntent, intent)) {
    await chrome.storage.local.remove('openIntent');
  }
}

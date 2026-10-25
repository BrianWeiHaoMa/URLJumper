// The address-bar keyword `j` (F6, G28): each input lists the popup's mappings for the text as Chrome's
// suggestions, and Enter opens the chosen one through the one *jump*, which records the use (G26), or searches
// unmatched text through Chrome's default engine without recording a mapping use. Both run
// on the worker's queue, so an input's record is stored before the next input's and before the Enter that
// follows it; Enter reads the record from storage, since the worker's memory may not have survived (S2).
import { readSearchOrder } from '../preferences';
import { readMappings, readUsage } from '../stored-document';
import { addressBarList, enteredTarget, readAddressBarRecord } from './address-bar-suggestions';
import { jump } from './jump';
import { enqueue } from './queue';

type Suggest = (suggestions: chrome.omnibox.SuggestResult[]) => void;
type Disposition = `${chrome.omnibox.OnInputEnteredDisposition}`;

const SEARCH_KEYS = ['mappings', 'usage', 'searchOrder'];

/**
 * Lists the mappings for `text`: the record first, then row 1 as the default suggestion, awaited, since later
 * Chrome ignores a default set after `suggest` for the same input (S7), then rows 2 onward to `suggest`.
 */
export function listInAddressBar(text: string, suggest: Suggest): Promise<void> {
  return enqueue(async () => {
    const list = addressBarList({ ...searchInputs(await chrome.storage.local.get(SEARCH_KEYS)), typed: text });
    let kept = true;
    try {
      await chrome.storage.local.set({ omnibox: list.record });
    } catch {
      // Refused, which State's budget leaves outside E3. An older record must not answer for this list, so it
      // goes, and only the default is shown: Enter on it opens row 1 of a fresh list for the same text.
      kept = false;
      await chrome.storage.local.remove('omnibox').catch(() => undefined);
    }
    await chrome.omnibox.setDefaultSuggestion({ description: list.defaultDescription });
    suggest(kept ? list.suggestions : []);
  }).catch(() => undefined);
}

/** Opens a mapping or a default-engine search (G28) in the tab `disposition` asks for; blank input does nothing. */
export function openFromAddressBar(text: string, disposition: Disposition): Promise<void> {
  // The tab and window Enter was pressed in are those in front as Enter arrives, asked for before the queue:
  // while earlier operations run, the user can bring another tab or window to the front.
  const front = chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  return enqueue(async () => {
    const { omnibox, ...items } = await chrome.storage.local.get(['omnibox', ...SEARCH_KEYS]);
    const target = enteredTarget(text, readAddressBarRecord(omnibox), searchInputs(items));
    if (target === undefined) return;
    const [tab] = await front;
    if ('search' in target) {
      // Target the captured tab or create one in its window, so queue delays cannot redirect the search.
      const destination = disposition === 'currentTab' ? tab : await chrome.tabs.create({
        active: disposition === 'newForegroundTab',
        ...(tab === undefined ? {} : { windowId: tab.windowId }),
      });
      if (destination?.id !== undefined) await chrome.search.query({ text: target.search, tabId: destination.id });
      return;
    }
    // Called directly, not through `perform`: this operation is already on the queue, and would wait for itself.
    if (disposition !== 'currentTab') {
      const active = disposition === 'newForegroundTab';
      await jump({ kind: 'jump', ...target, mode: 'new-tab', active, ...(tab === undefined ? {} : { windowId: tab.windowId }) });
      return;
    }
    if (tab?.id !== undefined) await jump({ kind: 'jump', ...target, mode: 'this-tab', tabId: tab.id });
  }).catch(() => undefined);
}

// As the popup reads them, so the two lists are the same (How G1, G2, G28).
function searchInputs({ mappings, usage, searchOrder }: Record<string, unknown>) {
  return {
    document: readMappings(mappings),
    usage: readUsage(usage),
    order: readSearchOrder(searchOrder),
    now: Date.now(),
  };
}

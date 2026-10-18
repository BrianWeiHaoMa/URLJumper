// The right-click menu items (F7, G29): *Name this page in URLJumper* on a page and *Name this link in
// URLJumper* on a link, each opening the popup on the Name form through the one opening routine.
import type { IntentSubject } from '../open-intent';
import { openPopupFor, windowOf } from './open-popup';

const NAME_PAGE = 'name-this-page';
const NAME_LINK = 'name-this-link';

const ITEMS: chrome.contextMenus.CreateProperties[] = [
  { id: NAME_PAGE, title: 'Name this page in URLJumper', contexts: ['page'] },
  { id: NAME_LINK, title: 'Name this link in URLJumper', contexts: ['link'] },
];

let creating: Promise<void> = Promise.resolve();

/**
 * Removes the extension's menu items and creates them again: on install, update, and every start, so a
 * Chrome closed before it stored them has them again (S13). Removing first, and one call after another,
 * means a create never meets an item with its id, which Chrome refuses.
 */
export function createMenuItems(): Promise<void> {
  creating = creating.then(recreate, recreate);
  return creating;
}

async function recreate(): Promise<void> {
  await chrome.contextMenus.removeAll();
  await Promise.all(ITEMS.map(create));
}

function create(item: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(item, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

/** A click on one of the items: the popup opens on the Name form in the window it was clicked in. */
export async function runMenuItem(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const subject = subjectOf(info, tab);
  if (subject === undefined) return;
  const windowId = await windowOf(tab);
  if (windowId !== undefined) await openPopupFor(subject, windowId);
}

// The link's address, and the page's address and title where Chrome gave them; absent ones stay out of the record.
function subjectOf(info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab | undefined): IntentSubject | undefined {
  if (info.menuItemId === NAME_PAGE) return { kind: 'name-page' };
  if (info.menuItemId !== NAME_LINK || !info.linkUrl) return undefined;
  return {
    kind: 'name-link',
    linkUrl: info.linkUrl,
    ...(info.pageUrl ? { pageUrl: info.pageUrl } : {}),
    ...(tab?.title ? { pageTitle: tab.title } : {}),
  };
}

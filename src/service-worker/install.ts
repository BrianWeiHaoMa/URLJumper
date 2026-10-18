// What an install or an update records (G23 to G25): a new install starts in Smart order, and an update from
// 1.x marks the what's-new notice pending. Nothing else is written; the document and the theme never are.
import type { SearchOrder } from '../document/search';

export async function recordInstall(details: chrome.runtime.InstalledDetails): Promise<void> {
  if (details.reason === 'install') {
    const searchOrder: SearchOrder = 'smart';
    await chrome.storage.local.set({ searchOrder });
  } else if (details.reason === 'update' && isBefore2(details.previousVersion)) {
    await chrome.storage.local.set({ upgradeNotice: 'pending' });
  }
}

// Chrome's versions are one to four dot-separated integers, so one is below 2.0.0 exactly when its first is below 2.
function isBefore2(version: string): boolean {
  const major = Number(version.split('.')[0]);
  return Number.isInteger(major) && major < 2;
}

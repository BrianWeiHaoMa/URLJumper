import type { NavMode } from './storage';

export async function navigate(rawUrl: string, mode: NavMode): Promise<void> {
  const target = rawUrl;
  if (mode === 'new') {
    await chrome.tabs.create({ url: target });
  } else {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id != null) {
      await chrome.tabs.update(tab.id, { url: target });
    } else {
      await chrome.tabs.create({ url: target });
    }
  }
}

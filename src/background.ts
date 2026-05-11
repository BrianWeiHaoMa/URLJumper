import { storage, type NavMode } from './lib/storage';

chrome.commands.onCommand.addListener(async (command) => {
  let mode: NavMode;
  if (command === 'open-same-tab') {
    mode = 'same';
  } else if (command === 'open-new-tab') {
    mode = 'new';
  } else {
    return;
  }

  await storage.setPendingMode(mode);

  try {
    await chrome.action.openPopup();
  } catch (err) {
    console.warn('chrome.action.openPopup() failed:', err);
  }
});

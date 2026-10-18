// The service worker: the only writer of the document and the owner of Chrome's events (commands, menus,
// the address-bar keyword, install). Every listener is added here, at the top level, so it is registered when
// the worker starts and Chrome can deliver the event that started it; what each one does lives beside this file.
import { isRequest } from '../requests';
import { runCommand } from './commands';
import { recordInstall } from './install';
import { reopenPopupOnFocus } from './open-popup';
import { perform } from './perform';

chrome.runtime.onInstalled.addListener(recordInstall);
chrome.commands.onCommand.addListener(runCommand);
chrome.windows.onFocusChanged.addListener(reopenPopupOnFocus);
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isRequest(message)) return false;
  void perform(message).then(sendResponse);
  // Literal true, replying through sendResponse: Chrome waits for a returned promise only from Chrome 148.
  return true;
});

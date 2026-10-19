// Jump (G6, G26): record the use of a mapping the document still holds, then open its URL, with every `%s`
// filled by the argument or removed (F9), in a new tab or the given one. Nothing opens unless the use is
// recorded first, so every navigation of a held mapping counts.
import { fillArgument } from '../document/argument';
import { mappingKey, readDocument } from '../document/grammar';
import { recordUse } from '../document/score';
import { chromeMessage, type JumpReply, type JumpRequest } from '../requests';
import { readMappings, readUsage } from '../stored-document';

export async function jump(request: JumpRequest): Promise<JumpReply> {
  const url = fillArgument(request.url, request.argument ?? '');
  if (url === undefined) return { kind: 'failed', message: 'This address is longer than Chrome opens.' };

  try {
    const { mappings, usage } = await chrome.storage.local.get(['mappings', 'usage']);
    const key = mappingKey(request.name, request.url);
    const held = readDocument(readMappings(mappings)).mappings.some((mapping) => mapping.key === key);
    if (held) await chrome.storage.local.set({ usage: recordUse(readUsage(usage), key, Date.now()) });
  } catch (error) {
    return { kind: 'storage-failed', message: chromeMessage(error) };
  }

  try {
    // In the window the user acted in: by now another window may have the focus.
    if (request.mode === 'new-tab') await chrome.tabs.create({ url, active: request.active, ...(request.windowId === undefined ? {} : { windowId: request.windowId }) });
    else await chrome.tabs.update(request.tabId, { url });
  } catch (error) {
    return { kind: 'failed', message: chromeMessage(error) };
  }
  return { kind: 'opened' };
}

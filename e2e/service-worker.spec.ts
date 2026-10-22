import fs from 'node:fs';
import path from 'node:path';
import { distDir, expect, test } from './extension.ts';

test("the built worker runs from the extension's origin as version 2.1.0", async ({ extension }) => {
  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
  expect(extension.worker.url()).toBe(extension.url(manifest.background.service_worker));
  const seen = await extension.worker.evaluate(() => [location.origin, chrome.runtime.id, chrome.runtime.getManifest().version]);
  expect(seen).toEqual([`chrome-extension://${extension.id}`, extension.id, '2.1.0']);
});

test("the worker has Chrome's command, menu, keyword, install, and startup events to listen to", async ({ extension }) => {
  // Each exists only with its manifest declaration: `commands`, `contextMenus`, `omnibox`.
  const dispatchers = await extension.worker.evaluate(() => {
    const events = [
      chrome.commands?.onCommand,
      chrome.contextMenus?.onClicked,
      chrome.omnibox?.onInputChanged,
      chrome.omnibox?.onInputEntered,
      chrome.runtime.onInstalled,
      chrome.runtime.onStartup,
    ] as ({ dispatch?: unknown } | undefined)[];
    return events.map((event) => typeof event?.dispatch);
  });
  expect(dispatchers).toEqual(Array(6).fill('function'));
});

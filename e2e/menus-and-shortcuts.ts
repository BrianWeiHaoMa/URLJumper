// Chrome's own menus and shortcuts page, which headless Chrome cannot show: what a check needs to see the
// extension's right-click menu items and to change a shortcut as the user would there, and to leave a page
// for it and come back, re-exported by e2e/extension.ts. Menu clicks themselves are dispatched to the worker
// with `dispatchEvent`.
import type { BrowserContext, Page, Worker } from '@playwright/test';

/** Whether the extension has a menu item with `id`: Chrome updates an existing one and refuses a missing one. */
export function menuItemExists(worker: Worker, id: string): Promise<boolean> {
  return worker.evaluate(
    (id) =>
      chrome.contextMenus.update(id, {}).then(
        () => true,
        () => false,
      ),
    id,
  );
}

/** What Chrome says to creating one more menu item with `id`: its error, or `created` when it took it. */
export function createMenuItemAgain(worker: Worker, id: string): Promise<string> {
  return worker.evaluate(
    (id) =>
      new Promise<string>((resolve) => {
        chrome.contextMenus.create({ id, title: 'Another item', contexts: ['page'] }, () => resolve(chrome.runtime.lastError?.message ?? 'created'));
      }),
    id,
  );
}

/** Removes every menu item of the extension, as a Chrome closed before it stored them starts without them (S13). */
export async function removeMenuItems(worker: Worker): Promise<void> {
  await worker.evaluate(() => chrome.contextMenus.removeAll());
}

/**
 * Starts recording, in order, the worker's calls that write storage or add or remove its menu items, each
 * with its first argument, as they reach Chrome; the function returned gives those so far.
 */
export async function recordWorkerCalls(worker: Worker): Promise<() => Promise<[string, unknown][]>> {
  await worker.evaluate(() => {
    const calls: [string, unknown][] = [];
    (globalThis as Record<string, unknown>).workerCalls = calls;
    const record = (owner: Record<string, unknown>, method: string, label: string) => {
      const original = (owner[method] as (...args: unknown[]) => unknown).bind(owner);
      owner[method] = (...args: unknown[]) => {
        calls.push([label, args[0] ?? null]);
        return original(...args);
      };
    };
    for (const method of ['set', 'remove', 'clear']) record(chrome.storage.local as unknown as Record<string, unknown>, method, `storage.${method}`);
    for (const method of ['create', 'removeAll', 'remove']) record(chrome.contextMenus as unknown as Record<string, unknown>, method, `contextMenus.${method}`);
  });
  return () => worker.evaluate(() => (globalThis as Record<string, unknown>).workerCalls as [string, unknown][]);
}

/** The shortcut Chrome has assigned to each of the extension's commands now, by name; `''` for none. */
export function assignedShortcuts(worker: Worker): Promise<Record<string, string>> {
  return worker.evaluate(async () => Object.fromEntries((await chrome.commands.getAll()).map((command) => [command.name!, command.shortcut ?? ''])));
}

/** Assigns `key` (such as `Alt+J`) to `command` on Chrome's own shortcuts page, as the user does there (E6). */
export async function assignShortcut(context: BrowserContext, extensionId: string, command: string, key: string): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto('chrome://extensions/shortcuts');
    await page.evaluate(
      ([extensionId, commandName, keybinding]) =>
        (chrome as unknown as { developerPrivate: { updateExtensionCommand(update: object): Promise<void> } }).developerPrivate.updateExtensionCommand({
          extensionId,
          commandName,
          keybinding,
        }),
      [extensionId, command, key] as const,
    );
  } finally {
    await page.close();
  }
}

/**
 * Lets `page` lose and regain the focus as its tab does: Playwright otherwise keeps every page focused, so
 * a page never learns that the user went to another tab, such as Chrome's shortcuts page, and came back.
 */
export async function followTabFocus(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
}

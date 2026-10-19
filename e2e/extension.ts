// The one harness every end-to-end check uses: the built extension loaded from dist/ into a fresh headless
// profile, or 1.3.0 loaded there and updated to it, reached only through Chrome's events and APIs, its pages,
// and storage.
import { test as base, type Page, type Worker } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { checkAccessibilityInBothSchemes } from './accessibility.ts';
import { distDir, launchChrome, waitForStoredKey, type LoadedExtension } from './extension-launch.ts';
import { checkFit } from './popup-fit.ts';
import { keptRelease1xBuild, withRelease1x, type Release1x } from './upgrade-from-1x.ts';

export { expect } from '@playwright/test';
export { addressBar, chromeShows, type AddressBar, type AddressBarInput, type ChromeRow, type Disposition } from './address-bar.ts';
export { checkAccessibility, checkAccessibilityInBothSchemes, focusDrawn } from './accessibility.ts';
export { distDir, type LoadedExtension, type RequestPage } from './extension-launch.ts';
export { checkFit } from './popup-fit.ts';
export { assignedShortcuts, assignShortcut, createMenuItemAgain, followTabFocus, menuItemExists, recordWorkerCalls, removeMenuItems } from './menus-and-shortcuts.ts';
export { caret, clipboardText, delayPageReads, holdFileReads, holdPageReads, holdPageRequests, importFile, retypeLine, storedDraft, textView, textViewInPopup, textViewOnOptionsPage, typeAtEnd, version, watchDraftSets, watchRequests, type TextView } from './text-view.ts';
export { type Release1x } from './upgrade-from-1x.ts';
export { expectNoNotice, upgradeNotice } from './upgrade-notice.ts';
export { editSelectedRow, lineConfirmation, rowEditor, rowPencils, thisPagePencil, type RowEditor } from './row-editor.ts';
export { restartWorker, stallWorkerAfterWriting } from './worker-restart.ts';

export interface LocalSite {
  /** The address of a page served from 127.0.0.1 whose title is `title`. */
  pageUrl(title: string): string;
}

export const test = base.extend<{ extension: LoadedExtension; site: LocalSite; release1x: Release1x }, { release1xBuild: string }>({
  extension: async ({}, use) => {
    const launched = await launchChrome(distDir);
    try {
      const worker = await launched.extensionWorker();
      // Every launch is a fresh install, whose write of the search order lands at its own pace: no check starts
      // before it has, so what a check seeds is never overwritten by it.
      await waitForStoredKey(worker, 'searchOrder', 'the install wrote no search order');
      await use(await launched.loadedExtension(worker));
    } finally {
      await launched.close();
    }
  },

  // The first build in a clone runs 1.3.0's own `npm ci`, which can outlast a test's 30 seconds; later ones reuse it.
  release1xBuild: [async ({}, use) => use(keptRelease1xBuild()), { scope: 'worker', timeout: 300_000 }],

  release1x: async ({ release1xBuild }, use) => withRelease1x(release1xBuild, use),

  site: async ({}, use) => {
    const titles = new Map<string, string>();
    const server = http.createServer((request, response) => {
      const title = titles.get(request.url ?? '');
      response.statusCode = title === undefined ? 404 : 200;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><title>${escapeHtml(title ?? 'Not found')}</title>`);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('the local site has no port');
    const pageUrl = (title: string) => {
      const pagePath = `/page-${titles.size + 1}`;
      titles.set(pagePath, title);
      return `http://127.0.0.1:${address.port}${pagePath}`;
    };
    try {
      await use({ pageUrl });
    } finally {
      // The browser may still hold a keep-alive connection, which close() alone would wait for.
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
    }
  },
});

/**
 * Records, on `page`, every Content Security Policy violation and every request outside the package
 * from its next navigation on: call it before `page.goto`, since a page already loaded is not watched.
 */
export async function watchPolicy(page: Page, extension: LoadedExtension) {
  const offPackage: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(extension.url(''))) offPackage.push(request.url());
  });
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(window, 'policyViolations', { value: seen });
    document.addEventListener('securitypolicyviolation', (event) => seen.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  return {
    offPackage,
    violations: async () => {
      const seen = await page.evaluate(() => (window as { policyViolations?: string[] }).policyViolations);
      if (!seen) throw new Error('the page was not watched: call watchPolicy before it navigates');
      return seen;
    },
  };
}

/**
 * F11's example document, read from the product specification: the indented block after F11, its two-space
 * indent removed, with LF endings and a final line break.
 */
export function exampleFromSpecification(): string {
  const specification = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'PRODUCT_SPECIFICATION.md'), 'utf8').split('\n');
  const f11 = specification.findIndex((line) => line.startsWith('- **F11.**'));
  const open = specification.indexOf('  ```', f11);
  const close = specification.indexOf('  ```', open + 1);
  if (f11 === -1 || open === -1 || close === -1) throw new Error("F11's block was not found in the product specification");
  return specification.slice(open + 1, close).map((line) => line.slice(2)).join('\n') + '\n';
}

/** Makes Chrome's storage answer the worker's reads that ask for `key` `ms` late, as it may under load. */
export async function slowWorkerReads(worker: Worker, key: string, ms: number): Promise<void> {
  await worker.evaluate(
    ([key, ms]) => {
      const local = chrome.storage.local;
      const get = local.get.bind(local) as (keys: unknown) => Promise<Record<string, unknown>>;
      (local as unknown as { get: unknown }).get = async (keys: unknown) => {
        const items = await get(keys);
        if ((Array.isArray(keys) ? keys : [keys]).includes(key)) await new Promise((resolve) => setTimeout(resolve, ms));
        return items;
      };
    },
    [key, ms] as const,
  );
}

/** Makes Chrome's storage refuse the worker's calls of `method`, such as `remove`, with `message`, as it refuses a write it cannot make. */
export async function refuseWorkerStorage(worker: Worker, method: 'set' | 'remove', message: string): Promise<void> {
  await worker.evaluate(
    ([method, message]) => {
      (chrome.storage.local as unknown as Record<string, unknown>)[method] = () => Promise.reject(new Error(message));
    },
    [method, message] as const,
  );
}

/**
 * What every popup state a check reaches is held to: it fits Chrome's popup with nothing of its own cut off
 * (G7), and it passes the accessibility pass in the light and the dark scheme (G32).
 */
export async function checkFitAndAccessibility(popup: Page): Promise<void> {
  await checkFit(popup);
  await checkAccessibilityInBothSchemes(popup);
}

/** Opens a page of `site` titled `title` and clicks the toolbar button on it: that page, and the real popup opened on it. */
export async function popupOnNewPage(extension: LoadedExtension, site: LocalSite, title = 'Where the popup opens') {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl(title));
  return { page, popup: await extension.clickToolbarButton(page) };
}

/**
 * Runs `action`, which closes `popup` as a jump that opened does, and waits for the close. The popup can close
 * before Chrome acknowledges the action's last event (a key or mouse button coming up): only that close
 * excuses the action's failure.
 */
export async function closingPopup(popup: Page, action: () => Promise<unknown>) {
  const closed = popup.waitForEvent('close');
  await action().catch(async (error: unknown) => {
    if (!(await closed.then(() => true, () => false))) throw error;
  });
  await closed;
}

/** Whether `page` is drawn in a dark or a light theme, from its background's luminance. */
export function shownTheme(page: Page): Promise<'dark' | 'light'> {
  return page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 'dark' : 'light';
  });
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

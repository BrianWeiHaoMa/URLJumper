// The one harness every end-to-end check uses: the built extension loaded from dist/ into a fresh
// headless profile, reached only through Chrome's events and APIs, its pages, and storage.
import { test as base, chromium, type Browser, type BrowserContext, type Page, type Worker } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export { expect } from '@playwright/test';

export const distDir = path.resolve(import.meta.dirname, '..', 'dist');

export interface LoadedExtension {
  context: BrowserContext;
  /** The extension's service worker, for reading and seeding `chrome.storage.local` and dispatching Chrome's events. */
  worker: Worker;
  id: string;
  /** The address of a file in the package, such as `popup.html`. */
  url(file: string): string;
  /**
   * Clicks the toolbar button on `tab`: Chrome opens the real action popup and grants the tab's
   * `url` and `title`, as a click does. Returns that popup, never a `popup.html` open in a tab.
   * `tab`'s address must be unique among open tabs: Chrome's CDP finds the tab only by address.
   */
  clickToolbarButton(tab: Page): Promise<Page>;
}

export interface LocalSite {
  /** The address of a page served from 127.0.0.1 whose title is `title`. */
  pageUrl(title: string): string;
}

export const test = base.extend<{ extension: LoadedExtension; site: LocalSite }>({
  extension: async ({}, use) => {
    // A fresh profile and a debugging port Chrome picks itself, so parallel workers never share either.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'urljumper-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${distDir}`,
        `--load-extension=${distDir}`,
        '--enable-unsafe-extension-debugging',
        '--remote-debugging-port=0',
      ],
    });
    const connections: Browser[] = [];
    try {
      const worker =
        context.serviceWorkers().find(isExtensionWorker) ??
        (await context.waitForEvent('serviceworker', { predicate: isExtensionWorker }));
      const id = new URL(worker.url()).host;
      const url = (file: string) => `chrome-extension://${id}/${file}`;
      const debuggingPort = await readDebuggingPort(profile);

      const clickToolbarButton = async (tab: Page): Promise<Page> => {
        await tab.bringToFront();
        const browser = context.browser();
        if (!browser) throw new Error('the persistent context has no browser to open a CDP session on');
        const cdp = await browser.newBrowserCDPSession();
        try {
          const popupTargets = async () =>
            (await cdp.send('Target.getTargets', { filter: [{ type: 'page' }] })).targetInfos
              .filter((target) => target.url === url('popup.html'))
              .map((target) => target.targetId);
          const before = new Set(await popupTargets());
          const tabs = (await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos;
          const matching = tabs.filter((target) => target.url === tab.url());
          if (matching.length !== 1) throw new Error(`expected one tab at ${tab.url()}, found ${matching.length}`);
          await cdp.send('Extensions.triggerAction', { id, targetId: matching[0]!.targetId });

          // The popup is the popup.html page target this click created; a popup.html tab existed before it.
          let opened: string | undefined;
          for (const deadline = Date.now() + 10_000; !opened && Date.now() < deadline; ) {
            opened = (await popupTargets()).find((targetId) => !before.has(targetId));
            if (!opened) await tab.waitForTimeout(50);
          }
          if (!opened) throw new Error('the toolbar button opened no popup');

          // The persistent context does not list the popup; a second CDP connection does.
          const connection = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
          connections.push(connection);
          for (const page of connection.contexts().flatMap((c) => c.pages())) {
            const session = await page.context().newCDPSession(page);
            const { targetInfo } = await session.send('Target.getTargetInfo');
            await session.detach();
            if (targetInfo.targetId === opened) return page;
          }
          throw new Error('the popup Chrome opened is not reachable over CDP');
        } finally {
          await cdp.detach();
        }
      };

      await use({ context, worker, id, url, clickToolbarButton });
    } finally {
      for (const connection of connections) await connection.close();
      await context.close();
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    }
  },

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

function isExtensionWorker(worker: Worker) {
  return worker.url().startsWith('chrome-extension://');
}

// Chrome writes the port it chose to the profile's DevToolsActivePort file once it listens.
async function readDebuggingPort(profile: string): Promise<number> {
  const file = path.join(profile, 'DevToolsActivePort');
  for (const deadline = Date.now() + 10_000; Date.now() < deadline; ) {
    const port = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8').split('\n')[0]) : 0;
    if (port > 0) return port;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Chrome wrote no debugging port to ${file}`);
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

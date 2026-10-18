// The one harness every end-to-end check uses: the built extension loaded from dist/ into a fresh
// headless profile, reached only through Chrome's events and APIs, its pages, and storage.
import { test as base, chromium, type Browser, type BrowserContext, type Page, type Worker } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Request } from '../src/requests.ts';

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
  /**
   * Presses `command`'s shortcut with `tab` in front, as `dispatchEvent` does with the tab Chrome passes
   * (see `frontTab`), and returns the real popup the worker opened; fails when none opened.
   */
  popupByCommand(command: string, tab: Page): Promise<Page>;
  /**
   * Dispatches the worker's `event`, such as `runtime.onInstalled` or `windows.onFocusChanged`, to its
   * listeners with `args`, the arguments Chrome passes. Waits for nothing the listeners do.
   */
  dispatchEvent(event: string, ...args: unknown[]): Promise<void>;
  /** Runs `action` and returns the real action popup it opened; fails when none opened within ten seconds. */
  popupOpenedBy(action: () => Promise<unknown>): Promise<Page>;
  /** How many action popups are open now. */
  openPopups(): Promise<number>;
  /**
   * Brings `tab` to the front and returns the tab Chrome gives it, as the worker sees it (without its `url`
   * and `title`, which only a grant gives): what Chrome passes a command pressed there.
   */
  frontTab(tab: Page): Promise<chrome.tabs.Tab>;
  /**
   * The address each open tab was last sent to, from Chrome's tab targets. For a host that does not
   * resolve, which is every host but 127.0.0.1, it is the address asked for, where Playwright's
   * `page.url()` gives Chrome's error page.
   */
  tabUrls(): Promise<string[]>;
  /** Replaces the whole of `chrome.storage.local` with `items`. Every check starts after the launch's install write landed. */
  seedStorage(items: Record<string, unknown>): Promise<void>;
  /** The whole of `chrome.storage.local`. */
  readStorage(): Promise<Record<string, unknown>>;
  /** Fills `chrome.storage.local` with one more key until only `bytesLeft` bytes of its quota are free. */
  fillStorage(bytesLeft: number): Promise<void>;
  /** Starts recording the changes `storage.onChanged` reports in `chrome.storage.local`; the function returned gives those so far, oldest first. */
  watchStorage(): Promise<() => Promise<Record<string, chrome.storage.StorageChange>[]>>;
  /** Sends `request` to the worker from a `popup.html` tab, as a page of the extension does, and resolves to the reply Chrome delivers. */
  sendRequest(request: Request): Promise<unknown>;
  /**
   * Says this check causes a request from the extension's origin to `url`: a This tab jump it asks for, or
   * a request it plants. Every check fails when a request from the extension's origin reached Chrome's
   * network stack; with this, it fails unless the requests made went to exactly the URLs said.
   */
  expectExtensionRequest(url: string): void;
}

export interface LocalSite {
  /** The address of a page served from 127.0.0.1 whose title is `title`. */
  pageUrl(title: string): string;
}

export const test = base.extend<{ extension: LoadedExtension; site: LocalSite }>({
  extension: async ({}, use) => {
    // A fresh profile and a debugging port Chrome picks itself, so parallel workers never share either.
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'urljumper-e2e-'));
    const netLog = path.join(profile, 'net-log.json');
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${distDir}`,
        `--load-extension=${distDir}`,
        '--enable-unsafe-extension-debugging',
        '--remote-debugging-port=0',
        // Every request that reaches the network, from every context, for the whole run.
        `--log-net-log=${netLog}`,
        // No check reaches the public web or depends on it.
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      ],
    });
    const connections: Browser[] = [];
    const expectedRequests = new Set<string>();
    let id: string | undefined;
    try {
      const worker =
        context.serviceWorkers().find(isExtensionWorker) ??
        (await context.waitForEvent('serviceworker', { predicate: isExtensionWorker }));
      id = new URL(worker.url()).host;
      const extensionId = id;
      const url = (file: string) => `chrome-extension://${extensionId}/${file}`;
      const debuggingPort = await readDebuggingPort(profile);
      await waitForInstallWrite(worker);

      const popups = popupOpeners(context, extensionId, debuggingPort, connections);
      await use({
        context,
        worker,
        id,
        url,
        ...popups,
        popupByCommand: async (command, tab) => {
          const front = await frontTab(worker, tab);
          return popups.popupOpenedBy(() => dispatchEvent(worker, 'commands.onCommand', command, front));
        },
        dispatchEvent: (event, ...args) => dispatchEvent(worker, event, ...args),
        openPopups: () => worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })).length),
        frontTab: (tab) => frontTab(worker, tab),
        tabUrls: async () => {
          const cdp = await browserSession(context);
          try {
            return (await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos.map((target) => target.url);
          } finally {
            await cdp.detach();
          }
        },
        ...storageAccess(worker),
        sendRequest: requestSender(context, url('popup.html')),
        expectExtensionRequest: (requestUrl) => expectedRequests.add(requestUrl),
      });
    } finally {
      try {
        for (const connection of connections) await connection.close();
        await context.close();
        // Chrome finishes its net log as it exits.
        if (id !== undefined) checkExtensionRequests(netLog, id, expectedRequests);
      } finally {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
      }
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

function browserSession(context: BrowserContext) {
  const browser = context.browser();
  if (!browser) throw new Error('the persistent context has no browser to open a CDP session on');
  return browser.newBrowserCDPSession();
}

// The real action popup, found as the popup.html page target an action created; a connection made after it
// opened reaches it, which the persistent context never does.
function popupOpeners(context: BrowserContext, id: string, debuggingPort: number, connections: Browser[]) {
  const popupUrl = `chrome-extension://${id}/popup.html`;

  const popupOpenedBy = async (action: () => Promise<unknown>): Promise<Page> => {
    const cdp = await browserSession(context);
    try {
      const popupTargets = async () =>
        (await cdp.send('Target.getTargets', { filter: [{ type: 'page' }] })).targetInfos
          .filter((target) => target.url === popupUrl)
          .map((target) => target.targetId);
      // A popup.html open in a tab before the action is not the popup.
      const before = new Set(await popupTargets());
      await action();

      let opened: string | undefined;
      for (const deadline = Date.now() + 10_000; !opened && Date.now() < deadline; ) {
        opened = (await popupTargets()).find((targetId) => !before.has(targetId));
        if (!opened) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!opened) throw new Error('no popup opened');

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

  const clickToolbarButton = async (tab: Page): Promise<Page> => {
    await tab.bringToFront();
    const cdp = await browserSession(context);
    try {
      const tabs = (await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] })).targetInfos;
      const matching = tabs.filter((target) => target.url === tab.url());
      if (matching.length !== 1) throw new Error(`expected one tab at ${tab.url()}, found ${matching.length}`);
      return await popupOpenedBy(() => cdp.send('Extensions.triggerAction', { id, targetId: matching[0]!.targetId }));
    } finally {
      await cdp.detach();
    }
  };

  return { popupOpenedBy, clickToolbarButton };
}

function dispatchEvent(worker: Worker, event: string, ...args: unknown[]) {
  return worker.evaluate(
    ([event, args]) => {
      const [namespace, name] = event.split('.') as [string, string];
      const target = (chrome as unknown as Record<string, Record<string, Dispatchable | undefined>>)[namespace]?.[name];
      if (!target) throw new Error(`the worker has no event chrome.${event}`);
      target.dispatch(...args);
    },
    [event, args] as const,
  );
}

async function frontTab(worker: Worker, tab: Page) {
  await tab.bringToFront();
  return worker.evaluate(async () => {
    const [front] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!front) throw new Error('no tab is in front');
    return front;
  });
}

function storageAccess(worker: Worker) {
  let watches = 0;
  return {
    seedStorage: (items: Record<string, unknown>) =>
      worker.evaluate(async (items) => {
        await chrome.storage.local.clear();
        await chrome.storage.local.set(items);
      }, items),
    readStorage: () => worker.evaluate(() => chrome.storage.local.get(null)),
    fillStorage: (bytesLeft: number) =>
      worker.evaluate(async (bytesLeft) => {
        const free = chrome.storage.local.QUOTA_BYTES - (await chrome.storage.local.getBytesInUse(null));
        // A key counts its own length and its value's JSON serialization: here the text and two quotes.
        const key = 'storageFiller';
        await chrome.storage.local.set({ [key]: 'x'.repeat(free - key.length - 2 - bytesLeft) });
      }, bytesLeft),
    watchStorage: async () => {
      const name = `storageChanges${++watches}`;
      await worker.evaluate((name) => {
        const changes: unknown[] = [];
        (globalThis as Record<string, unknown>)[name] = changes;
        chrome.storage.onChanged.addListener((change, area) => {
          if (area === 'local') changes.push(change);
        });
      }, name);
      return () => worker.evaluate((name) => (globalThis as Record<string, unknown>)[name] as Record<string, chrome.storage.StorageChange>[], name);
    },
  };
}

// Requests go from one popup.html tab, opened at the first request of a check.
function requestSender(context: BrowserContext, popupUrl: string) {
  let host: Promise<Page> | undefined;
  return async (request: Request) => {
    host ??= context.newPage().then(async (page) => {
      await page.goto(popupUrl);
      return page;
    });
    return (await host).evaluate((request) => chrome.runtime.sendMessage(request), request);
  };
}

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
 * Fails unless the requests from the extension's origin that reached Chrome's network stack, whether or
 * not their host then resolved, went to exactly the `expected` URLs. Chrome's net log gives the extension's
 * origin as the initiator of an extension page's own requests and navigations, and of a navigation the
 * worker starts with `tabs.update`, which is why a check declares the This tab jumps it asks for; one the
 * worker starts with `tabs.create` has none. A request the CSP refuses never reaches the network or the
 * log (`watchPolicy` sees those).
 */
function checkExtensionRequests(netLog: string, id: string, expected: ReadonlySet<string>) {
  let log: NetLog;
  try {
    log = JSON.parse(fs.readFileSync(netLog, 'utf8'));
  } catch (error) {
    throw new Error(`Chrome's net log of the run is unreadable, so its requests are unchecked: ${String(error)}`);
  }
  const startJob = log.constants.logEventTypes.URL_REQUEST_START_JOB;
  const made = new Set(
    log.events
      .filter((event) => event.type === startJob && event.params?.initiator === `chrome-extension://${id}`)
      .map((event) => String(event.params?.url)),
  );
  const unexpected = [...made].filter((url) => !expected.has(url));
  const missing = [...expected].filter((url) => !made.has(url));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `requests from the extension's origin reached the network undeclared: ${JSON.stringify(unexpected)}; ` +
        `declared but not made: ${JSON.stringify(missing)}`,
    );
  }
}

// Chrome's events in the worker have a `dispatch` its typings leave out.
interface Dispatchable {
  dispatch(...args: unknown[]): void;
}

interface NetLog {
  constants: { logEventTypes: Record<string, number> };
  events: { type: number; params?: { url?: unknown; initiator?: unknown } }[];
}

// Every launch is a fresh install, whose write of the search order lands at its own pace: no check starts
// before it has, so what a check seeds is never overwritten by it.
async function waitForInstallWrite(worker: Worker) {
  for (const deadline = Date.now() + 10_000; Date.now() < deadline; ) {
    if (await worker.evaluate(async () => 'searchOrder' in (await chrome.storage.local.get('searchOrder')))) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the install wrote no search order');
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

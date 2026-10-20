// Chrome launched headless into a fresh profile with one unpacked extension, and the handle a check drives that
// extension by: the `extension` fixture launches dist/ this way, and an upgrade from 1.x launches 1.3.0 this way
// before putting dist/ in its place. Re-exported by e2e/extension.ts, which this module never imports.
import { chromium, type Browser, type BrowserContext, type Page, type Worker } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Request } from '../src/requests.ts';

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
  /**
   * Runs `action` and returns the real action popup it opened, once Chrome has shown it and given it the
   * keyboard (as every popup opener here does); fails when none opened within ten seconds.
   */
  popupOpenedBy(action: () => Promise<unknown>): Promise<Page>;
  /** How many action popups are open now. */
  openPopups(): Promise<number>;
  /**
   * Brings `tab` to the front and returns the tab Chrome gives it, as the worker sees it (without its `url`
   * and `title`, which only a grant gives): what Chrome passes a command pressed there. Headless, this changes
   * the active tab but not the focused window, which a window created focused keeps; the worker's
   * `chrome.windows.update(id, { focused: true })` moves it, so a check with two windows creates the second
   * unfocused and asserts which window this reports.
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
  /**
   * Fills `chrome.storage.local` with one more key until only `bytesLeft` bytes of its quota are free. A Text
   * view writes `draft` as the user types, so after typing a check first waits until `draft` holds the text,
   * or a draft write lands between this measure and this write.
   */
  fillStorage(bytesLeft: number): Promise<void>;
  /**
   * Starts recording the changes `storage.onChanged` reports in `chrome.storage.local`; the function returned
   * gives those so far, oldest first. Typing in a Text view writes `draft` as it goes, so a check that counts
   * stores of the document counts the changes that hold `mappings` or `usage`.
   */
  watchStorage(): Promise<() => Promise<Record<string, chrome.storage.StorageChange>[]>>;
  /**
   * Sends `request` to the worker from a `popup.html` tab, as a page of the extension does, and resolves to the
   * reply Chrome delivers. The first call opens that tab, and a tab opened while the action popup is open can
   * close it: a check sends its first request, or opens its request page, before it opens the popup.
   */
  sendRequest(request: Request): Promise<unknown>;
  /** Opens one more `popup.html` tab to send requests from, as another popup or settings tab of the extension does (E1); before the popup, as `sendRequest` says. */
  openRequestPage(): Promise<RequestPage>;
  /**
   * Says this check causes a request from the extension's origin to `url`: a This tab jump it asks for, or
   * a request it plants. Every check fails when a request from the extension's origin reached Chrome's
   * network stack; with this, it fails unless the requests made went to exactly the URLs said.
   */
  expectExtensionRequest(url: string): void;
}

/** A page of the extension that sends requests to the worker. */
export interface RequestPage {
  /** Sends `request` and resolves to the reply Chrome delivers. */
  send(request: Request): Promise<unknown>;
  /** Sends `request` and closes the page without waiting for the reply, as Chrome closes a popup during a save (E4). */
  sendAndClose(request: Request): Promise<void>;
}

/** Chrome running headless in a fresh profile with the unpacked extension of one directory. */
export interface LaunchedChrome {
  context: BrowserContext;
  /** The extension's service worker: the one running, else the first to start. */
  extensionWorker(): Promise<Worker>;
  /** The handle a check drives the extension by, through `worker`, its service worker now. */
  loadedExtension(worker: Worker): Promise<LoadedExtension>;
  /**
   * Closes Chrome, then fails unless the requests from the extension's origin over the whole run went to
   * exactly the URLs checks declared, and removes the profile.
   */
  close(): Promise<void>;
}

/**
 * Launches Chrome with the unpacked extension in `extensionDir`, a directory that stays put for the whole run,
 * at `deviceScaleFactor` device pixels per CSS pixel: the display's scale, which Chrome sizes the popup in.
 */
export async function launchChrome(extensionDir: string, deviceScaleFactor = 1): Promise<LaunchedChrome> {
  // A fresh profile and a debugging port Chrome picks itself, so parallel workers never share either.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'urljumper-e2e-'));
  const netLog = path.join(profile, 'net-log.json');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      '--enable-unsafe-extension-debugging',
      '--remote-debugging-port=0',
      // Only off the default: the flag itself changes by a pixel how tall a headless popup may be.
      ...(deviceScaleFactor === 1 ? [] : [`--force-device-scale-factor=${deviceScaleFactor}`]),
      // Every request that reaches the network, from every context, for the whole run.
      `--log-net-log=${netLog}`,
      // No check reaches the public web or depends on it.
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    ],
  });
  const connections: Browser[] = [];
  const expectedRequests = new Set<string>();
  // The extension's id follows its directory, so every version loaded from it shares one origin.
  let id: string | undefined;
  let debuggingPort: number | undefined;

  return {
    context,
    extensionWorker: async () => {
      const worker =
        context.serviceWorkers().find(isExtensionWorker) ??
        (await context.waitForEvent('serviceworker', { predicate: isExtensionWorker }));
      id = new URL(worker.url()).host;
      return worker;
    },
    loadedExtension: async (worker) => {
      const extensionId = new URL(worker.url()).host;
      id = extensionId;
      debuggingPort ??= await readDebuggingPort(profile);
      const url = (file: string) => `chrome-extension://${extensionId}/${file}`;
      const popups = popupOpeners(context, extensionId, debuggingPort, connections);
      return {
        context,
        worker,
        id: extensionId,
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
        openRequestPage: () => openRequestPage(context, url('popup.html')),
        expectExtensionRequest: (requestUrl) => expectedRequests.add(requestUrl),
      };
    },
    close: async () => {
      try {
        for (const connection of connections) await connection.close();
        await context.close();
        // Chrome finishes its net log as it exits.
        if (id !== undefined) checkExtensionRequests(netLog, id, expectedRequests);
      } finally {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
      }
    },
  };
}

/** Waits until `key` is in `worker`'s `chrome.storage.local`, failing with `failure` after ten seconds. */
export async function waitForStoredKey(worker: Worker, key: string, failure: string): Promise<void> {
  for (const deadline = Date.now() + 10_000; Date.now() < deadline; ) {
    if (await worker.evaluate(async (key) => key in (await chrome.storage.local.get(key)), key)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(failure);
}

export function isExtensionWorker(worker: Worker) {
  return worker.url().startsWith('chrome-extension://');
}

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
        if (targetInfo.targetId !== opened) continue;
        // The target exists before the page has loaded; Chrome shows the popup and gives it the keyboard only
        // once its load completes. From then on a key a check types is one a user could have typed.
        await page.waitForFunction(() => document.hasFocus(), undefined, { polling: 20, timeout: 10_000 });
        return page;
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
  let host: Promise<RequestPage> | undefined;
  return async (request: Request) => {
    host ??= openRequestPage(context, popupUrl);
    return (await host).send(request);
  };
}

async function openRequestPage(context: BrowserContext, popupUrl: string): Promise<RequestPage> {
  const page = await context.newPage();
  await page.goto(popupUrl);
  return {
    send: (request) => page.evaluate((request) => chrome.runtime.sendMessage(request), request),
    sendAndClose: async (request) => {
      await page.evaluate((request) => {
        // A reply to a closed page goes nowhere; nothing waits for it.
        chrome.runtime.sendMessage(request).catch(() => undefined);
      }, request);
      await page.close();
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

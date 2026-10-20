// The Text view as a check reaches it, re-exported by e2e/extension.ts: its parts found by their names, the
// offer to bring in a change and its versions, the offer of a kept draft, the question a switch to the List view
// asks over unsaved text, the view opened in the popup's settings or on the options page once its text area
// holds the stored document or once it offers a kept draft, typing into a line as a user does, where the caret
// is, the draft stored and the wait until it holds a text, the draft sets the worker receives and stores, a file
// handed to Import and its read held, the requests the worker receives and a page's requests sent late, a page's
// reads of storage made late or answered late, and the clipboard, which *Copy tab URL* writes, read back from a
// web page.
import { expect, type BrowserContext, type Locator, type Page, type Worker } from '@playwright/test';
import type { Draft } from '../src/draft.ts';
import type { LoadedExtension } from './extension-launch.ts';

/** The Text view's parts in `page`, a popup or an options page that shows it. */
export function textView(page: Page) {
  return {
    area: page.getByRole('textbox', { name: 'Document' }),
    save: page.getByRole('button', { name: 'Save', exact: true }),
    /** What the last Save came to: *Saved*, *Not saved*, and why. */
    status: page.locator('.text-view-status'),
    errors: page.getByRole('list', { name: 'Errors' }).getByRole('button'),
    copyTabUrl: page.getByRole('button', { name: 'Copy tab URL' }),
    /** The offer a Save refused because the stored document changed makes: to bring that change into the text. */
    offer: page.getByRole('region', { name: "Bring in the stored document's change" }),
    /** The offer's parts changed in both, in order, each with its two versions (`version`). */
    conflicts: page.getByRole('group', { name: /^Changed in both/ }),
    bringIn: page.getByRole('button', { name: 'Bring in the change' }),
    /** The offer of a kept draft a Text view makes as it opens, and its two answers. */
    keptOffer: page.getByRole('region', { name: 'Unsaved text kept' }),
    resume: page.getByRole('button', { name: 'Resume', exact: true }),
    discard: page.getByRole('button', { name: 'Discard', exact: true }),
    /** What the view says when the worker did not keep its draft. */
    notKept: page.getByRole('alert').filter({ hasText: 'not kept for later' }),
    /** The question a switch to the List view asks over unsaved text, and its three answers. */
    switchQuestion: page.getByRole('region', { name: 'Switch to List with unsaved text?' }),
    saveAndSwitch: page.getByRole('button', { name: 'Save and switch', exact: true }),
    keepAndSwitch: page.getByRole('button', { name: 'Keep the draft and switch', exact: true }),
    stay: page.getByRole('button', { name: 'Stay', exact: true }),
  };
}

/** The stored document's version, or the text's (`yours`), of `conflict`, one of `TextView['conflicts']`. */
export function version(conflict: Locator, side: 'stored' | 'yours'): Locator {
  return conflict.getByRole('button', { name: side === 'stored' ? /^Stored document/ : /^Your text/ });
}

export type TextView = ReturnType<typeof textView>;

/** How a Text view is expected to open: holding the stored document, editable, or offering a kept draft, its text area taking no typing. */
export type TextViewOpening = 'editable' | 'offering';

/** Opens the popup's settings by the gear, in search or the first run, and shows the Text view once it holds the stored document or offers a kept draft. */
export async function textViewInPopup(popup: Page, opening: TextViewOpening = 'editable'): Promise<TextView> {
  await popup.getByRole('button', { name: 'Settings' }).click();
  await popup.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Text' }).click();
  const view = textView(popup);
  await opened(view, opening);
  return view;
}

/** Opens a tab of `options.html` at `fragment`, the Text view by default, and returns it once its text area holds the stored document or it offers a kept draft. */
export async function textViewOnOptionsPage(
  extension: { context: BrowserContext; url(file: string): string },
  fragment = '#view=text',
  opening: TextViewOpening = 'editable',
): Promise<TextView & { page: Page }> {
  const page = await extension.context.newPage();
  await page.goto(extension.url(`options.html${fragment}`));
  const view = textView(page);
  await opened(view, opening);
  return { page, ...view };
}

async function opened(view: TextView, opening: TextViewOpening) {
  if (opening === 'editable') {
    // Read-only until it holds the stored document.
    await expect(view.area).toBeEditable();
    await expect(view.keptOffer).toHaveCount(0);
  } else {
    await expect(view.keptOffer).toBeVisible();
    await expect(view.area).not.toBeEditable();
  }
}

/** The draft the worker keeps, as stored under `draft`; undefined when none is. */
export async function storedDraft(worker: Worker): Promise<Draft | undefined> {
  return worker.evaluate(async () => (await chrome.storage.local.get('draft')).draft as Draft | undefined);
}

/** Waits until the draft stored holds `text`: the typing has been kept, so no write of it lands while a check goes on. */
export async function draftLanded(extension: LoadedExtension, text: string) {
  await expect.poll(async () => (await storedDraft(extension.worker))?.text).toBe(text);
}

/**
 * Starts recording, in the worker, when each *draft set* arrives and when each write of `draft` it makes has
 * landed, which is just before the worker replies to it; the function returned gives both lists of times,
 * oldest first.
 */
export async function watchDraftSets(worker: Worker): Promise<() => Promise<{ received: number[]; stored: number[] }>> {
  await worker.evaluate(() => {
    const record = { received: [] as number[], stored: [] as number[] };
    (globalThis as Record<string, unknown>).draftSets = record;
    chrome.runtime.onMessage.addListener((message: { kind?: unknown }) => {
      if (message?.kind === 'draft-set') record.received.push(performance.now());
      return false;
    });
    const local = chrome.storage.local;
    const set = local.set.bind(local) as (items: Record<string, unknown>) => Promise<void>;
    (local as unknown as { set: unknown }).set = async (items: Record<string, unknown>) => {
      await set(items);
      if ('draft' in items) record.stored.push(performance.now());
    };
  });
  return () => worker.evaluate(() => (globalThis as Record<string, unknown>).draftSets as { received: number[]; stored: number[] });
}

/** Activates Import on the options page `page` shows and chooses a file named `name` holding `bytes`, through the file chooser it opens. */
export async function importFile(page: Page, name: string, bytes: Buffer, activate: () => Promise<void> = () => page.getByRole('button', { name: 'Import…' }).click()) {
  const chooser = page.waitForEvent('filechooser');
  // Playwright turns its interception of the chooser on without waiting for it: a key pressed at once can open
  // the chooser before it is intercepted, and no event comes. A round trip to the page lets it take effect.
  await page.evaluate(() => undefined);
  await activate();
  await (await chooser).setFiles({ name, mimeType: 'text/plain', buffer: bytes });
}

/** Selects the text of `line` of the text area's text, as a user selecting the line would, and types `text` over it. */
export async function retypeLine(view: TextView, line: number, text: string) {
  await view.area.evaluate((area: HTMLTextAreaElement, line) => {
    const starts = [0];
    for (let at = area.value.indexOf('\n'); at !== -1; at = area.value.indexOf('\n', at + 1)) starts.push(at + 1);
    const start = starts[line - 1]!;
    const end = line < starts.length ? starts[line]! - 1 : area.value.length;
    area.focus();
    area.setSelectionRange(start, end);
  }, line);
  await view.area.page().keyboard.type(text);
}

/** Puts the caret at the end of the text area's text and types `text`. */
export async function typeAtEnd(view: TextView, text: string) {
  await view.area.evaluate((area: HTMLTextAreaElement) => {
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  });
  await view.area.page().keyboard.type(text);
}

/** Where the caret is: the text area has the focus, its line (from 1, counting the text area's lines), and whether that line is inside the text area's visible box. */
export function caret(area: Locator) {
  return area.evaluate((area: HTMLTextAreaElement) => {
    const style = getComputedStyle(area);
    const lineHeight = parseFloat(style.lineHeight);
    const row = area.value.slice(0, area.selectionStart).split('\n').length - 1;
    const top = parseFloat(style.paddingTop) + row * lineHeight - area.scrollTop;
    return {
      focused: document.activeElement === area,
      line: row + 1,
      atLineStart: area.selectionStart === area.selectionEnd && (area.selectionStart === 0 || area.value[area.selectionStart - 1] === '\n'),
      inView: area.wrap === 'off' && top >= 0 && top + lineHeight <= area.clientHeight,
    };
  });
}

/**
 * Starts recording the requests of `kind` the worker receives from the extension's pages; the function
 * returned gives those so far, oldest first.
 */
export async function watchRequests(worker: Worker, kind: string): Promise<() => Promise<unknown[]>> {
  const name = `${kind}Requests`;
  await worker.evaluate(
    ([name, kind]) => {
      const received: unknown[] = [];
      (globalThis as Record<string, unknown>)[name] = received;
      chrome.runtime.onMessage.addListener((message: { kind?: unknown }) => {
        if (message?.kind === kind) received.push(message);
        return false;
      });
    },
    [name, kind] as const,
  );
  return () => worker.evaluate((name) => (globalThis as Record<string, unknown>)[name] as unknown[], name);
}

/**
 * Makes every read of `chrome.storage.local` that `page` makes from now wait `ms` before it is made, as a busy
 * profile may answer it late, so a change that lands meanwhile is in what the read gives. The function
 * returned gives how many of those reads are still unanswered.
 */
export async function delayPageReads(page: Page, ms: number): Promise<() => Promise<number>> {
  await page.evaluate((ms) => {
    const local = chrome.storage.local;
    const get = local.get.bind(local) as (keys?: unknown) => Promise<Record<string, unknown>>;
    const unanswered = { count: 0 };
    (globalThis as Record<string, unknown>).delayedReads = unanswered;
    (local as unknown as { get: unknown }).get = async (keys?: unknown) => {
      unanswered.count++;
      try {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return await get(keys);
      } finally {
        unanswered.count--;
      }
    };
  }, ms);
  return () => page.evaluate(() => ((globalThis as Record<string, unknown>).delayedReads as { count: number }).count);
}

/**
 * Holds the answer to every read of `chrome.storage.local` that `page` makes from now, each read made at once
 * and its answer given only when released, oldest first, as a busy page may hear a read late, after a change
 * made since. `held` gives how many answers wait; `release` gives the oldest.
 */
export async function holdPageReads(page: Page): Promise<{ held(): Promise<number>; release(): Promise<void> }> {
  await page.evaluate(() => {
    const local = chrome.storage.local;
    const get = local.get.bind(local) as (keys?: unknown) => Promise<Record<string, unknown>>;
    const waiting: (() => void)[] = [];
    (globalThis as Record<string, unknown>).heldReads = waiting;
    (local as unknown as { get: unknown }).get = async (keys?: unknown) => {
      const items = await get(keys);
      await new Promise<void>((release) => waiting.push(release));
      return items;
    };
  });
  return {
    held: () => page.evaluate(() => ((globalThis as Record<string, unknown>).heldReads as unknown[]).length),
    release: () => page.evaluate(() => ((globalThis as Record<string, unknown>).heldReads as (() => void)[]).shift()?.()),
  };
}

/**
 * Holds every request of `kind` that `page` sends to the worker from now, each sent only when released, oldest
 * first, as a busy page may send it late; its reply reaches the page as Chrome gives it. `held` gives how many
 * wait; `release` sends the oldest.
 */
export async function holdPageRequests(page: Page, kind: string): Promise<{ held(): Promise<number>; release(): Promise<void> }> {
  await page.evaluate((kind) => {
    const runtime = chrome.runtime;
    const sendMessage = runtime.sendMessage.bind(runtime) as (message: unknown) => Promise<unknown>;
    const waiting: (() => void)[] = [];
    (globalThis as Record<string, unknown>).heldRequests = waiting;
    (runtime as unknown as { sendMessage: unknown }).sendMessage = (message: { kind?: unknown }) =>
      message?.kind === kind ? new Promise((reply, refuse) => waiting.push(() => sendMessage(message).then(reply, refuse))) : sendMessage(message);
  }, kind);
  return {
    held: () => page.evaluate(() => ((globalThis as Record<string, unknown>).heldRequests as unknown[]).length),
    release: () => page.evaluate(() => ((globalThis as Record<string, unknown>).heldRequests as (() => void)[]).shift()?.()),
  };
}

/** Holds the end of every read of a chosen file's text in `page` (`File.text()`) until the function returned is called. */
export async function holdFileReads(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => {
    const read = File.prototype.text;
    const waiting: (() => void)[] = [];
    (globalThis as Record<string, unknown>).heldFileReads = waiting;
    File.prototype.text = async function (this: File) {
      const text = await read.call(this);
      await new Promise<void>((release) => waiting.push(release));
      return text;
    };
  });
  return async () => {
    await expect.poll(() => page.evaluate(() => ((globalThis as Record<string, unknown>).heldFileReads as unknown[]).length)).toBeGreaterThan(0);
    await page.evaluate(() => ((globalThis as Record<string, unknown>).heldFileReads as (() => void)[]).shift()?.());
  };
}

/**
 * The text on the clipboard, read in `page`, a web page: Chrome grants `clipboard-read` to a web page's origin
 * but to no extension's, which it calls opaque.
 */
export async function clipboardText(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read'], { origin: new URL(page.url()).origin });
  return page.evaluate(() => navigator.clipboard.readText());
}

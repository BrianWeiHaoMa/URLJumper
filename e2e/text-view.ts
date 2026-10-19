// The Text view as a check reaches it, re-exported by e2e/extension.ts: its parts found by their names, the
// view opened in the popup's settings or on the options page once its text area holds the stored document,
// typing into a line as a user does, where the caret is, the requests the worker receives, and the clipboard,
// which *Copy tab URL* writes, read back from a web page.
import { expect, type BrowserContext, type Locator, type Page, type Worker } from '@playwright/test';

/** The Text view's parts in `page`, a popup or an options page that shows it. */
export function textView(page: Page) {
  return {
    area: page.getByRole('textbox', { name: 'Document' }),
    save: page.getByRole('button', { name: 'Save', exact: true }),
    /** What the last Save came to: *Saved*, *Not saved*, and why. */
    status: page.locator('.text-view-status'),
    errors: page.getByRole('list', { name: 'Errors' }).getByRole('button'),
    copyTabUrl: page.getByRole('button', { name: 'Copy tab URL' }),
  };
}

export type TextView = ReturnType<typeof textView>;

/** Opens the popup's settings by the gear, in search or the first run, and shows the Text view once it holds the stored document. */
export async function textViewInPopup(popup: Page): Promise<TextView> {
  await popup.getByRole('button', { name: 'Settings' }).click();
  await popup.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Text' }).click();
  const view = textView(popup);
  // Read-only until it holds the stored document.
  await expect(view.area).toBeEditable();
  return view;
}

/** Opens a tab of `options.html` at `fragment`, the Text view by default, and returns it once its text area holds the stored document. */
export async function textViewOnOptionsPage(extension: { context: BrowserContext; url(file: string): string }, fragment = '#view=text'): Promise<TextView & { page: Page }> {
  const page = await extension.context.newPage();
  await page.goto(extension.url(`options.html${fragment}`));
  const view = textView(page);
  await expect(view.area).toBeEditable();
  return { page, ...view };
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
 * The text on the clipboard, read in `page`, a web page: Chrome grants `clipboard-read` to a web page's origin
 * but to no extension's, which it calls opaque.
 */
export async function clipboardText(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read'], { origin: new URL(page.url()).origin });
  return page.evaluate(() => navigator.clipboard.readText());
}

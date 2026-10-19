// What the Text view's Save keeps when it cannot store (G18, G21; Composition, *replace*, "Settings views";
// State): a view with nothing typed takes in every change to the stored document, while a change that lands
// under typing is never overwritten, before or after the view hears of it, so Save stores nothing, says so, and
// stores nothing more until the change is brought in (e2e/text-view-merge.spec.ts);
// the text area is read-only while a Save is under way and sends one; a store Chrome refuses, or a Save that gets
// no reply, says so and keeps the text and the base it was loaded with; and a popup closed during a Save leaves
// its outcome stored.
import type { Page } from '@playwright/test';
import {
  checkAccessibilityInBothSchemes,
  checkFitAndAccessibility,
  delayPageReads,
  expect,
  popupOnNewPage,
  restartWorker,
  slowWorkerReads,
  stallWorkerAfterWriting,
  test,
  textViewInPopup,
  textViewOnOptionsPage,
  typeAtEnd,
  watchRequests,
  type LoadedExtension,
} from './extension.ts';

const CHANGED = 'Not saved: the stored document changed after this text was loaded, in another view or window. Your text is kept as you typed it.';
const INSERT = { kind: 'insert', name: 'other', url: 'https://other.example/', note: '', heading: null } as const;

/** Resolves once `page` has heard the next change to `mappings` and a read it then makes has been answered, after every read its views made on hearing it. */
function heardAndRead(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const heard = (changes: Record<string, unknown>, area: string) => {
          if (area !== 'local' || !('mappings' in changes)) return;
          chrome.storage.onChanged.removeListener(heard);
          void chrome.storage.local.get('mappings').then(() => resolve());
        };
        chrome.storage.onChanged.addListener(heard);
      }),
  );
}

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

test('a view with nothing typed takes in another page\'s change, and a Save after typing keeps it, on an LF and on a CRLF document', async ({ extension, site }) => {
  for (const [stored, inserted] of [
    ['a  https://a/\nb  https://b/\n', 'a  https://a/\nb  https://b/\nother https://other.example/\n'],
    ['a  https://a/\r\nb  https://b/\r\n', 'a  https://a/\r\nb  https://b/\r\nother https://other.example/\r\n'],
  ] as const) {
    await extension.seedStorage({ mappings: stored });
    // The other page is opened before the popup, which a tab opened later can close.
    const other = await extension.openRequestPage();
    const { page, popup } = await popupOnNewPage(extension, site);
    const view = await textViewInPopup(popup);
    expect(await other.send(INSERT)).toMatchObject({ kind: 'applied', line: 3 });
    expect(await storedDocument(extension)).toBe(inserted);
    await expect(view.area).toHaveValue(inserted.replaceAll('\r\n', '\n'));
    await typeAtEnd(view, 'typed  https://typed/\n');
    await view.save.click();
    await expect(view.status).toHaveText('Saved');
    expect(await storedDocument(extension)).toBe(`${inserted.replaceAll('\r\n', '\n')}typed  https://typed/\n`);
    await popup.close();
    await page.close();
  }
});

test('a change that lands under typing is never overwritten: Save stores nothing and says so, whether pressed at once or once the view has heard of it, and nothing more until the change is brought in', async ({ extension, site }) => {
  for (const when of ['at once', 'once heard'] as const) {
    const stored = 'a  https://a/\nb  https://b/\n';
    await extension.seedStorage({ mappings: stored });
    const other = await extension.openRequestPage();
    const { page, popup } = await popupOnNewPage(extension, site);
    const view = await textViewInPopup(popup);
    await typeAtEnd(view, 'typed  https://typed/\n');
    const typed = `${stored}typed  https://typed/\n`;
    const heard = when === 'once heard' ? heardAndRead(popup) : undefined;
    expect(await other.send(INSERT)).toMatchObject({ kind: 'applied' });
    await heard;
    const inserted = await storedDocument(extension);
    expect(inserted).toBe(`${stored}other https://other.example/\n`);
    // Heard or not, the text area keeps the typing.
    await expect(view.area).toHaveValue(typed);

    await view.save.click();
    await expect(view.status, when).toHaveText(CHANGED);
    expect(await storedDocument(extension), when).toBe(inserted);
    await expect(view.area).toHaveValue(typed);
    // The offer stands, and the text it merges is the text submitted: not editable until it is brought in.
    await expect(view.offer).toBeVisible();
    await expect(view.area).not.toBeEditable();
    await checkFitAndAccessibility(popup);
    // Save again stores nothing and sends nothing until the change is brought in.
    const replaces = await watchRequests(extension.worker, 'replace');
    await view.save.focus();
    await popup.keyboard.press('Enter');
    await view.save.click({ force: true });
    // Time for a request, had one been sent, to reach the worker.
    await popup.waitForTimeout(300);
    await expect(view.status).toHaveText(CHANGED);
    await expect(view.area).toHaveValue(typed);
    expect(await storedDocument(extension)).toBe(inserted);
    expect(await replaces()).toEqual([]);
    await popup.close();
    await page.close();
  }
});

test("a Save from the options page's Text view is not overwritten by the popup's, which says so", async ({ extension, site }) => {
  const stored = 'a  https://a/\n';
  await extension.seedStorage({ mappings: stored });
  // Opened before the popup, which a tab opened later can close.
  const options = await textViewOnOptionsPage(extension);
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await typeAtEnd(view, 'from-popup  https://p/\n');
  await typeAtEnd(options, 'from-options  https://o/\n');
  await options.save.click();
  await expect(options.status).toHaveText('Saved');
  const saved = `${stored}from-options  https://o/\n`;
  expect(await storedDocument(extension)).toBe(saved);
  await expect(view.area).toHaveValue(`${stored}from-popup  https://p/\n`);
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  expect(await storedDocument(extension)).toBe(saved);
  await expect(view.area).toHaveValue(`${stored}from-popup  https://p/\n`);
});

test('while a Save is under way the text area is read-only and Save sends nothing more; then it is editable again', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await typeAtEnd(view, 'b  https://b/\n');
  const changes = await extension.watchStorage();
  const replaces = await watchRequests(extension.worker, 'replace');
  await slowWorkerReads(extension.worker, 'mappings', 10_000);
  await view.save.click();
  await expect(view.status).toHaveText('Saving…');
  await expect(view.area).not.toBeEditable();
  await expect(popup.locator('footer')).toHaveText('Saving · Enter does nothing until it is stored');
  await popup.keyboard.press('Enter');
  await view.area.focus();
  await expect(popup.locator('footer')).toHaveText('Saving · Enter does nothing until it is stored');
  await popup.keyboard.type('zz');
  await expect(view.area).toHaveValue('a  https://a/\nb  https://b/\n');
  await checkFitAndAccessibility(popup);

  await expect(view.status).toHaveText('Saved', { timeout: 15_000 });
  await expect(view.area).toBeEditable();
  expect(await replaces()).toHaveLength(1);
  expect(await changes()).toHaveLength(1);
  expect(await storedDocument(extension)).toBe('a  https://a/\nb  https://b/\n');
  await view.area.focus();
  await expect(popup.locator('footer')).toHaveText('Enter starts a new line');
});

test('a store Chrome refuses says so and keeps the text and its base: once there is room, Save stores it, and a change that landed meanwhile is not overwritten', async ({ extension, site }) => {
  const stored = 'a  https://a/\n';
  await extension.seedStorage({ mappings: stored });
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  const long = `long  https://long.example/${'x'.repeat(2_000)}\n`;
  await typeAtEnd(view, long);
  await extension.fillStorage(100);
  await view.save.click();
  await expect(view.status).toHaveText(/^Not saved: your text is kept as you typed it\. Chrome said: .*quota/i);
  await expect(view.area).toHaveValue(stored + long);
  await expect(view.area).toBeEditable();
  expect(await storedDocument(extension)).toBe(stored);
  await checkFitAndAccessibility(popup);

  await extension.worker.evaluate(() => chrome.storage.local.remove('storageFiller'));
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect(await storedDocument(extension)).toBe(stored + long);

  // Refused again; another page's change lands before the next Save, which must not store over it.
  await typeAtEnd(view, long.replace('long', 'longer'));
  await extension.fillStorage(100);
  await view.save.click();
  await expect(view.status).toHaveText(/^Not saved: your text is kept as you typed it\. Chrome said: /);
  await extension.worker.evaluate(() => chrome.storage.local.remove('storageFiller'));
  expect(await other.send(INSERT)).toMatchObject({ kind: 'applied' });
  const inserted = await storedDocument(extension);
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  expect(await storedDocument(extension)).toBe(inserted);
  await expect(view.area).toHaveValue(stored + long + long.replace('long', 'longer'));
});

test('after a store Chrome refuses, a change that lands before the view reads the document again is not overwritten', async ({ extension, site }) => {
  const stored = 'a  https://a/\n';
  await extension.seedStorage({ mappings: stored });
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  const long = `long  https://long.example/${'x'.repeat(2_000)}\n`;
  await typeAtEnd(view, long);
  await extension.fillStorage(100);
  // The read the view makes on the reply is made after the other page's change has landed.
  const unanswered = await delayPageReads(popup, 2_000);
  await view.save.click();
  await expect(view.status).toHaveText(/^Not saved: your text is kept as you typed it\. Chrome said: .*quota/i);
  await extension.worker.evaluate(() => chrome.storage.local.remove('storageFiller'));
  expect(await other.send(INSERT)).toMatchObject({ kind: 'applied' });
  const inserted = await storedDocument(extension);
  await expect.poll(unanswered, { timeout: 10_000 }).toBe(0);
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  expect(await storedDocument(extension)).toBe(inserted);
  await expect(view.area).toHaveValue(stored + long);
});

test('a Save that gets no reply says so and keeps the text: stopped before its write, the next Save stores; stopped after it, what landed stays, a change made since is not overwritten, and bringing that change in gives back what landed once', async ({ extension, site }) => {
  const stored = 'a  https://a/\n';
  await extension.seedStorage({ mappings: stored });
  // Wakes the worker after it is stopped; refused, as the document is not empty, so it writes nothing.
  const other = await extension.openRequestPage();
  const wake = () => other.send({ kind: 'load-example' });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  const noReply = /^Not saved: your text is kept as you typed it\. Chrome said: /;

  await typeAtEnd(view, 'b  https://b/\n');
  const first = `${stored}b  https://b/\n`;
  await slowWorkerReads(extension.worker, 'mappings', 10_000);
  await view.save.click();
  await expect(view.status).toHaveText('Saving…');
  await restartWorker(extension.context, extension.worker, wake);
  await expect(view.status).toHaveText(noReply);
  expect(await storedDocument(extension)).toBe(stored);
  await expect(view.area).toHaveValue(first);
  await expect(view.area).toBeEditable();
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect(await storedDocument(extension)).toBe(first);

  await typeAtEnd(view, 'c  https://c/\n');
  const second = `${first}c  https://c/\n`;
  await stallWorkerAfterWriting(extension.worker, 'mappings');
  await view.save.click();
  await expect.poll(() => storedDocument(extension)).toBe(second);
  await expect(view.status).toHaveText('Saving…');
  await restartWorker(extension.context, extension.worker, wake);
  await expect(view.status).toHaveText(noReply);
  await expect(view.area).toHaveValue(second);
  expect(await storedDocument(extension)).toBe(second);
  expect(await other.send(INSERT)).toMatchObject({ kind: 'applied' });
  const inserted = await storedDocument(extension);
  await typeAtEnd(view, 'd  https://d/\n');
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  expect(await storedDocument(extension)).toBe(inserted);
  await expect(view.area).toHaveValue(`${second}d  https://d/\n`);
  await checkFitAndAccessibility(popup);
  // Brought in, what landed is in the text once, with the line the other page added and the line typed since.
  await expect(view.conflicts).toHaveCount(0);
  await view.bringIn.click();
  const merged = `${inserted}d  https://d/\n`;
  await expect(view.area).toHaveValue(merged);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect(await storedDocument(extension)).toBe(merged);
});

test('a popup closed during a Save leaves the text stored, and the next popup\'s Text view shows it', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const { page, popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await typeAtEnd(view, 'b  https://b/\n');
  await slowWorkerReads(extension.worker, 'mappings', 1_000);
  await view.save.click();
  await popup.close();
  await expect.poll(() => storedDocument(extension), { timeout: 10_000 }).toBe('a  https://a/\nb  https://b/\n');
  const next = await textViewInPopup(await extension.clickToolbarButton(page));
  await expect(next.area).toHaveValue('a  https://a/\nb  https://b/\n');
});

test("the options page's Text view in each state passes the accessibility pass in both schemes", async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const view = await textViewOnOptionsPage(extension);
  await checkAccessibilityInBothSchemes(view.page);
  await typeAtEnd(view, 'just-a-name\n');
  await view.save.click();
  await expect(view.errors).toHaveCount(1);
  await checkAccessibilityInBothSchemes(view.page);

  await view.area.fill('a  https://a/\nb  https://b/\n');
  await slowWorkerReads(extension.worker, 'mappings', 10_000);
  await view.save.click();
  await expect(view.status).toHaveText('Saving…');
  await checkAccessibilityInBothSchemes(view.page);
  await expect(view.status).toHaveText('Saved', { timeout: 15_000 });
  await checkAccessibilityInBothSchemes(view.page);
});

test("the options page's Text view, refused and failed, passes the accessibility pass in both schemes", async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'b  https://b/\n');
  expect(await extension.sendRequest(INSERT)).toMatchObject({ kind: 'applied' });
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  await checkAccessibilityInBothSchemes(view.page);

  await view.page.close();
  const fresh = await textViewOnOptionsPage(extension);
  await typeAtEnd(fresh, `long  https://long.example/${'x'.repeat(2_000)}\n`);
  await extension.fillStorage(100);
  await fresh.save.click();
  await expect(fresh.status).toHaveText(/^Not saved: your text is kept as you typed it\. Chrome said: /);
  await checkAccessibilityInBothSchemes(fresh.page);
});

test('a Save refused over another page\'s change keeps the text submitted and says so, though that text is the one the view loaded', async ({ extension }) => {
  const stored = 'a  https://a/\n';
  await extension.seedStorage({ mappings: stored });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'local  https://local/\n');
  expect(await extension.sendRequest(INSERT)).toMatchObject({ kind: 'applied' });
  await expect(view.area).toHaveValue(`${stored}local  https://local/\n`);
  // The typing taken back: the text area holds what it loaded.
  await view.area.fill(stored);
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  // A read made now is answered after the one the view made on the reply.
  await view.page.evaluate(() => chrome.storage.local.get('mappings'));
  await expect(view.area).toHaveValue(stored);
  await expect(view.status).toHaveText(CHANGED);
  expect(await storedDocument(extension)).toBe(`${stored}other https://other.example/\n`);
});

test('a Save that lists errors keeps the text and its errors when another page changes the document', async ({ extension }) => {
  const stored = 'a  https://a/\njust-a-name\n';
  await extension.seedStorage({ mappings: stored });
  const view = await textViewOnOptionsPage(extension);
  await view.save.click();
  await expect(view.errors).toHaveText(['Line 2: expected a name and a URL']);
  const heard = heardAndRead(view.page);
  expect(await extension.sendRequest(INSERT)).toMatchObject({ kind: 'applied' });
  await heard;
  await expect(view.area).toHaveValue(stored);
  await expect(view.status).toHaveText('Not saved');
  await expect(view.errors).toHaveText(['Line 2: expected a name and a URL']);
});

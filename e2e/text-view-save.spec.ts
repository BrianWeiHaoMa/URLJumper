// The Text view's Save in both settings hosts (In use, "Edit the text", "The most common failure"; G16, G17,
// G18, G21, G22; Composition, *replace*): a draft with no F4 error is stored exactly as the text area holds it,
// with its usage in the same write; a draft with any error stores nothing, lists every error by its line, and
// stays as typed; a Save over a document changed since the view loaded it stores nothing and says so; a store
// Chrome refuses says so and keeps the text.
import type { Page } from '@playwright/test';
import {
  caret,
  checkAccessibilityInBothSchemes,
  checkFitAndAccessibility,
  expect,
  holdPageReads,
  popupOnNewPage,
  retypeLine,
  test,
  textViewInPopup,
  textViewOnOptionsPage,
  typeAtEnd,
  type TextView,
} from './extension.ts';

const lines = (count: number, line = (n: number) => `m${n}${' '.repeat(18 - String(n).length)}https://m${n}.example/`) =>
  Array.from({ length: count }, (_, i) => line(i + 1));

/** The storage changes of `changes` that hold the document or its usage, leaving out the draft's own. */
const documentChanges = <C extends object>(changes: C[]): C[] => changes.filter((change) => 'mappings' in change || 'usage' in change);

/** In use, "The most common failure", in the host `page` shows, on a stored document of 20 mappings. */
async function mostCommonFailure(page: Page, view: TextView, stored: string, readStorage: () => Promise<Record<string, unknown>>, watch: () => Promise<object[]>) {
  await expect(view.area).toHaveValue(stored);
  await retypeLine(view, 12, 'stocks');
  const typed = stored.replace(lines(20)[11]!, 'stocks');
  await expect(view.area).toHaveValue(typed);
  await view.save.click();
  await expect(view.status).toHaveText('Not saved');
  await expect(view.errors).toHaveText(['Line 12: expected a name and a URL']);
  await expect(view.area).toHaveValue(typed);
  await expect(view.area).toBeEditable();

  // Enter on the error, then a click on it, each from elsewhere in the text.
  for (const activate of [async () => {
    await view.errors.first().focus();
    await page.keyboard.press('Enter');
  }, () => view.errors.first().click()]) {
    await view.area.evaluate((area: HTMLTextAreaElement) => {
      area.setSelectionRange(area.value.length, area.value.length);
      area.scrollTop = area.scrollHeight;
    });
    await activate();
    expect(await caret(view.area)).toEqual({ focused: true, line: 12, atLineStart: true, inView: true });
    expect(await view.area.evaluate((area: HTMLTextAreaElement) => area.selectionStart)).toBe(typed.indexOf('stocks'));
    await expect(view.area).toHaveValue(typed);
  }
  expect((await readStorage()).mappings).toBe(stored);
  // A write the Save made would have reached every listener by now: the reads since were answered after it.
  // The draft the typing keeps is no write of the document.
  await readStorage();
  expect(documentChanges(await watch())).toEqual([]);
}

test('In use, "The most common failure", in the popup: nothing is stored, the error names line 12, activating it moves the caret there, and the draft stays as typed', async ({ extension, site }) => {
  const stored = lines(20).join('\n') + '\n';
  await extension.seedStorage({ mappings: stored });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  const watch = await extension.watchStorage();
  await mostCommonFailure(popup, view, stored, extension.readStorage, watch);
  await expect(popup.locator('footer')).toHaveText('Enter starts a new line');
  await view.errors.first().focus();
  await expect(popup.locator('footer')).toHaveText('Enter moves the caret to line 12');
  await checkFitAndAccessibility(popup);
});

test('In use, "The most common failure", on the options page: the same', async ({ extension }) => {
  const stored = lines(20).join('\n') + '\n';
  await extension.seedStorage({ mappings: stored });
  const view = await textViewOnOptionsPage(extension);
  const watch = await extension.watchStorage();
  await mostCommonFailure(view.page, view, stored, extension.readStorage, watch);
  await checkAccessibilityInBothSchemes(view.page);
});

test('a valid edit is stored exactly as the text area holds it, with its usage in the same write: a new name used once, a renamed name afresh', async ({ extension, site }) => {
  const stored = 'old  https://o.example/\nkeep  https://k.example/\n';
  const usedAt = Date.now() - 60_000;
  await extension.seedStorage({ mappings: stored, usage: { 'old\nhttps://o.example/': [usedAt], 'keep\nhttps://k.example/': [usedAt] } });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await retypeLine(view, 1, 'older  https://o.example/');
  await typeAtEnd(view, 'new  https://n.example/');
  const typed = 'older  https://o.example/\nkeep  https://k.example/\nnew  https://n.example/';
  await expect(view.area).toHaveValue(typed);
  const watch = await extension.watchStorage();
  const before = Date.now();
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  // The draft's own changes before and after it aside, one change holds the document, with its usage alone.
  const changes = documentChanges((await watch()) as Record<string, { newValue?: unknown }>[]);
  expect(changes).toHaveLength(1);
  expect(Object.keys(changes[0]!).sort()).toEqual(['mappings', 'usage']);
  expect(changes[0]!.mappings!.newValue).toBe(typed);
  const usage = changes[0]!.usage!.newValue as Record<string, number[]>;
  expect(Object.keys(usage).sort()).toEqual(['keep\nhttps://k.example/', 'new\nhttps://n.example/', 'older\nhttps://o.example/']);
  expect(usage['keep\nhttps://k.example/']).toEqual([usedAt]);
  for (const key of ['new\nhttps://n.example/', 'older\nhttps://o.example/']) {
    expect(usage[key]).toHaveLength(1);
    expect(usage[key]![0]).toBeGreaterThanOrEqual(before);
  }
  await expect(view.area).toHaveValue(typed);
  await expect(view.area).toBeEditable();
  await checkFitAndAccessibility(popup);
});

test('every error is listed in line order, each naming its line, and the first of two names in any case is no error', async ({ extension }) => {
  await extension.seedStorage({ mappings: '' });
  const view = await textViewOnOptionsPage(extension);
  const draft = ['mail  https://mail/', 'just-a-name', 'b  https://b/', '\\ a heading', 'a  example.com', '', 'c  https://c/', 'd  https://d/', 'Mail  https://m/'].join('\n');
  await view.area.fill(draft);
  await view.save.click();
  await expect(view.status).toHaveText('Not saved');
  await expect(view.errors).toHaveText([
    'Line 2: expected a name and a URL',
    'Line 5: expected a URL that begins with a scheme, such as https:',
    'Line 9: expected a name of its own, but line 1 has this name',
  ]);
  await expect(view.area).toHaveValue(draft);
  expect((await extension.readStorage()).mappings).toBe('');
  await checkAccessibilityInBothSchemes(view.page);
});

test("F4 is the rule, not the Name form's: a note holding a backslash, a tab in a name, and a no-break space are stored as typed", async ({ extension }) => {
  await extension.seedStorage({ mappings: 'x  https://x/\n' });
  const view = await textViewOnOptionsPage(extension);
  const draft = 'a  https://a/ \\ note\\more\nteam  calendar\t https://c/\nno break  https://n/\n';
  await view.area.fill(draft);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(draft);
  await expect(view.errors).toHaveCount(0);
});

test('any Unicode text is stored as the text area holds it, and saves again from the text it stored', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'x  https://x/\n' });
  const view = await textViewOnOptionsPage(extension);
  // What a Save that normalized, trimmed, or dropped characters would change (E3, E8): U+FEFF where a
  // byte-order mark would be, a character outside the Basic Multilingual Plane, an accent left as a combining
  // mark, right-to-left and CJK names, U+2028 and NUL inside notes, and whitespace at both ends.
  const draft = '\uFEFF  \n😀  https://e.example/\ncafe\u0301  https://c.example/ \\ a\u2028b\nשלום  https://s.example/\n東京\u3000駅  https://t.example/ \\ x\u0000y\n  last  https://l.example/  ';
  await view.area.fill(draft);
  await expect(view.area).toHaveValue(draft);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(draft);
  await expect(view.area).toHaveValue(draft);

  // The base is the text stored, so the next Save is not refused as changed.
  await retypeLine(view, 2, '😀😀  https://e.example/');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(draft.replace('😀', '😀😀'));
});

test('a CRLF document is saved as the text area holds it, with LF endings, and saves again from the text it stored', async ({ extension, site }) => {
  const stored = 'a  https://a/\r\nb  https://b/\r\nc  https://c/\r\n';
  await extension.seedStorage({ mappings: stored });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await expect(view.area).toHaveValue('a  https://a/\nb  https://b/\nc  https://c/\n');
  await typeAtEnd(view, 'd  https://d/\n');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  const first = 'a  https://a/\nb  https://b/\nc  https://c/\nd  https://d/\n';
  expect((await extension.readStorage()).mappings).toBe(first);
  await expect(view.area).toHaveValue(first);

  await retypeLine(view, 2, 'bee  https://b/');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(first.replace('b  https://b/', 'bee  https://b/'));

  // Saved without an edit, a CRLF document is stored as the text area holds it too.
  await extension.seedStorage({ mappings: stored });
  await expect(view.area).toHaveValue('a  https://a/\nb  https://b/\nc  https://c/\n');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  await expect.poll(async () => (await extension.readStorage()).mappings).toBe('a  https://a/\nb  https://b/\nc  https://c/\n');
});

test('a read made before a Save and answered after it never replaces the text the Save stored', async ({ extension }) => {
  const stored = 'a  https://a/\n';
  await extension.seedStorage({ mappings: stored });
  const view = await textViewOnOptionsPage(extension);
  const reads = await holdPageReads(view.page);
  // Saved as loaded, the view reads the document on the reply; that read's answer waits.
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  await expect.poll(reads.held).toBe(1);
  await typeAtEnd(view, 'mine  https://mine/\n');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  const saved = `${stored}mine  https://mine/\n`;
  expect((await extension.readStorage()).mappings).toBe(saved);
  await expect.poll(reads.held).toBeGreaterThan(1);
  while ((await reads.held()) > 0) await reads.release();
  await expect(view.area).toHaveValue(saved);
  await expect(view.status).toHaveText('Saved');
});

test('opening the Text view in either host and leaving it stores nothing', async ({ extension, site }) => {
  const stored = 'a  https://a/\r\n\\ heading\r\nb  https://b/';
  await extension.seedStorage({ mappings: stored });
  const watch = await extension.watchStorage();
  const { popup } = await popupOnNewPage(extension, site);
  await textViewInPopup(popup);
  await popup.getByRole('button', { name: 'Back' }).click();
  await expect(popup.getByRole('combobox')).toBeFocused();
  const options = await textViewOnOptionsPage(extension);
  await options.page.getByRole('button', { name: 'Preferences' }).click();
  await options.page.close();
  await extension.readStorage();
  expect(await watch()).toEqual([]);
  expect((await extension.readStorage()).mappings).toBe(stored);
});

test('a document of 10,000 lines and about 1 MB opens whole; one broken line is the one error; fixed, it is stored exactly', async ({ extension }) => {
  const stored = lines(10_000, (n) => `name-${String(n).padStart(5, '0')}          https://example.com/a/rather/long/path/to/page/${n}?with=query&and=more#here`).join('\n') + '\n';
  // E3's measure: the UTF-8 bytes of its JSON serialization, as Chrome stores it.
  const bytes = Buffer.byteLength(JSON.stringify(stored));
  expect(bytes).toBeGreaterThan(950_000);
  expect(bytes).toBeLessThanOrEqual(1_000_000);
  await extension.seedStorage({ mappings: stored });
  const view = await textViewOnOptionsPage(extension);
  expect(await view.area.evaluate((area: HTMLTextAreaElement) => area.value.length)).toBe(stored.length);
  await retypeLine(view, 5_000, 'broken');
  await view.save.click();
  await expect(view.status).toHaveText('Not saved');
  await expect(view.errors).toHaveText(['Line 5000: expected a name and a URL']);
  expect((await extension.readStorage()).mappings).toBe(stored);
  await retypeLine(view, 5_000, 'fixed  https://fixed.example/');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  const saved = stored.replace(/^name-05000 .*$/m, 'fixed  https://fixed.example/');
  expect(await view.area.evaluate((area: HTMLTextAreaElement, saved) => area.value === saved, saved)).toBe(true);
  expect((await extension.readStorage()).mappings === saved).toBe(true);
});

test('a stored line the extension cannot read is shown as it is, Save refuses until it is fixed, and fixed it is stored (G16)', async ({ extension, site }) => {
  const stored = 'a  https://a/\njust-a-name\nb  https://b/\n';
  await extension.seedStorage({ mappings: stored });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await expect(view.area).toHaveValue(stored);
  await view.save.click();
  await expect(view.errors).toHaveText(['Line 2: expected a name and a URL']);
  expect((await extension.readStorage()).mappings).toBe(stored);
  await retypeLine(view, 2, 'named  https://named/');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  await expect(view.errors).toHaveCount(0);
  expect((await extension.readStorage()).mappings).toBe('a  https://a/\nnamed  https://named/\nb  https://b/\n');
  await checkFitAndAccessibility(popup);
});

test('an absent document is an empty text area: a mapping typed there is stored, and a draft of only whitespace is stored as typed and leaves the first run', async ({ extension, site }) => {
  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  await expect(popup.getByRole('heading', { name: 'No mappings yet' })).toBeVisible();
  const view = await textViewInPopup(popup);
  await expect(view.area).toHaveValue('');
  await checkFitAndAccessibility(popup);
  await view.area.pressSequentially('typed  https://typed.example/');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe('typed  https://typed.example/');
  await popup.getByRole('button', { name: 'Back' }).click();
  await popup.getByRole('combobox').fill('typ');
  await expect(popup.locator('[role=option][aria-selected=true] .row-name')).toHaveText('typed');

  const again = await textViewInPopup(popup);
  await again.area.fill(' \n\t\n');
  await again.save.click();
  await expect(again.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(' \n\t\n');
  await popup.getByRole('button', { name: 'Back' }).click();
  await expect(popup.getByRole('heading', { name: 'No mappings yet' })).toBeVisible();
});

test('the worker stores a replace only over the base it names and only a text without an F4 error, with its usage', async ({ extension }) => {
  await extension.seedStorage({});
  const watch = await extension.watchStorage();
  expect(await extension.sendRequest({ kind: 'replace', text: 'just-a-name\n', base: '' })).toEqual({ kind: 'invalid', line: 1, problem: 'needs-name-and-url' });
  expect(await extension.sendRequest({ kind: 'replace', text: 'a  https://a/\n', base: 'something else' })).toEqual({ kind: 'changed', document: '' });
  expect(await extension.readStorage()).toEqual({});
  expect(await extension.sendRequest({ kind: 'replace', text: 'a  https://a/\r\nb  https://b/', base: '' })).toEqual({ kind: 'applied', text: 'a  https://a/\r\nb  https://b/', first: 1, last: 2 });
  const changes = (await watch()) as Record<string, { newValue?: unknown }>[];
  expect(changes).toHaveLength(1);
  expect(changes[0]!.mappings!.newValue).toBe('a  https://a/\r\nb  https://b/');
  expect(Object.keys(changes[0]!.usage!.newValue as object).sort()).toEqual(['a\nhttps://a/', 'b\nhttps://b/']);

  // Over a stored document: the base must be it exactly, CRLF and all; a base check comes before the text's.
  expect(await extension.sendRequest({ kind: 'replace', text: 'c  https://c/', base: 'a  https://a/\nb  https://b/' })).toEqual({ kind: 'changed', document: 'a  https://a/\r\nb  https://b/' });
  expect(await extension.sendRequest({ kind: 'replace', text: 'x\ny  https://y/\nY  https://y2/', base: 'a  https://a/\nb  https://b/' })).toMatchObject({ kind: 'changed' });
  expect(await extension.sendRequest({ kind: 'replace', text: 'ok  https://ok/\nY  https://y/\ny  https://y2/', base: 'a  https://a/\r\nb  https://b/' })).toEqual({ kind: 'invalid', line: 3, problem: 'repeated-name', heldBy: 2 });
  expect((await extension.readStorage()).mappings).toBe('a  https://a/\r\nb  https://b/');
  expect(await watch()).toHaveLength(1);
});

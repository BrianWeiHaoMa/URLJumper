// Bringing a change into the Text view (G18, G17, G7, G32, L2; In use, "Edit the text"; product Done when, "The
// Text view is open in a settings tab on a document with LF line endings …"): a Save refused because the stored
// document changed says so and offers the change, every part changed in both shown in both versions with none
// chosen; nothing is stored and the text area takes no typing until the change is brought in, with one action
// once each part has a version; then the merged text is the draft, the stored text merged its base, so the next
// Save stores both sides' changes, or is refused again if the document changed once more.
import type { Locator, Page } from '@playwright/test';
import type { Request } from '../src/requests.ts';
import {
  checkAccessibilityInBothSchemes,
  checkFitAndAccessibility,
  expect,
  popupOnNewPage,
  retypeLine,
  test,
  textViewInPopup,
  textViewOnOptionsPage,
  typeAtEnd,
  version,
  type LoadedExtension,
  type LocalSite,
  type TextView,
} from './extension.ts';

const CHANGED = 'Not saved: the stored document changed after this text was loaded, in another view or window. Your text is kept as you typed it.';
const MERGED = "The stored document's change is in your text. It is not stored until you save.";
const INSERT = { kind: 'insert', url: 'https://other.example/', note: '', heading: null } as const;

const footer = (popup: Page) => popup.locator('footer');
/** The lines a version shows, each as written. */
const linesShown = (shown: Locator) => shown.locator('.merge-line').evaluateAll((lines) => lines.map((line) => line.textContent));

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

/** Opens `site`'s page titled `title` in a window of its own, which takes the focus, with its address granted as a toolbar click grants it. */
async function pageInAnotherWindow(extension: LoadedExtension, site: LocalSite, title: string): Promise<Page> {
  const opened = extension.context.waitForEvent('page');
  await extension.worker.evaluate((url) => chrome.windows.create({ url, focused: true }), site.pageUrl(title));
  const page = await opened;
  await page.waitForLoadState();
  await (await extension.clickToolbarButton(page)).close();
  await expect.poll(() => extension.openPopups()).toBe(0);
  return page;
}

/** Saves, is refused as `changed` with `stored` left in place, and shows the offer. */
async function refused(extension: LoadedExtension, view: TextView, stored: string) {
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  await expect(view.offer).toBeVisible();
  expect(await storedDocument(extension)).toBe(stored);
}

/** Brings the change in, Saves, and finds `expected` stored, byte for byte, as the text area held it. */
async function broughtInAndSaved(extension: LoadedExtension, view: TextView, expected: string) {
  await view.bringIn.click();
  await expect(view.area).toHaveValue(expected);
  await expect(view.status).toHaveText(MERGED);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect(await storedDocument(extension)).toBe(expected);
}

for (const [typing, typed] of [
  ['followed by a line break', 'typed  https://typed.example/\n'],
  ['on the final empty line, with no break after it', 'typed  https://typed.example/'],
] as const) {
  test(`a line typed ${typing} in a settings tab and a page named in another window: Save offers the change, and after it stores both lines and nothing else`, async ({ extension, site }) => {
    const original = '\\ Work\nw  https://w.example/\n\nh  https://h.example/\n';
    await extension.seedStorage({ mappings: original });
    const options = await textViewOnOptionsPage(extension);
    await typeAtEnd(options, typed);

    const page = await pageInAnotherWindow(extension, site, 'Named in another window');
    const popup = await extension.popupByCommand('name-this-page', page);
    await popup.keyboard.type('named');
    await popup.keyboard.press('Enter');
    await expect(popup.getByRole('status')).toHaveText('Saved "named" as line 5');
    const named = (await storedDocument(extension)) as string;
    expect(named).toBe(`${original}named ${page.url()}\n`);
    await popup.close();

    await options.page.bringToFront();
    await refused(extension, options, named);
    await expect(options.conflicts).toHaveCount(0);
    await expect(options.area).toHaveValue(original + typed);
    await broughtInAndSaved(extension, options, `${original}named ${page.url()}\n${typed}`);
  });
}

for (const [first, second] of [
  ['stored', 'yours'],
  ['yours', 'stored'],
] as const) {
  test(`two lines changed differently on both sides, the first's ${first === 'stored' ? "stored version" : 'draft'} chosen and the second's ${second === 'stored' ? 'stored version' : 'draft'}, with a line the other page added`, async ({ extension }) => {
    const original = 'a  https://a/\nb  https://b/\nc  https://c/\nd  https://d/\ne  https://e/\n';
    const lines = {
      stored: { b: 'b  https://stored-b/', d: 'd  https://stored-d/' },
      yours: { b: 'b  https://draft-b/', d: 'd  https://draft-d/' },
    };
    await extension.seedStorage({ mappings: original });
    const view = await textViewOnOptionsPage(extension);
    await retypeLine(view, 2, lines.yours.b);
    await retypeLine(view, 4, lines.yours.d);
    const stored = `a  https://a/\n${lines.stored.b}\nc  https://c/\n${lines.stored.d}\ne  https://e/\nadded  https://added/\n`;
    expect(await extension.sendRequest({ kind: 'replace', text: stored, base: original })).toMatchObject({ kind: 'applied' });

    await refused(extension, view, stored);
    await expect(view.conflicts).toHaveCount(2);
    for (const [at, letter] of [[0, 'b'], [1, 'd']] as const) {
      const conflict = view.conflicts.nth(at);
      await expect(conflict.getByRole('heading')).toHaveText(`Changed in both, ${at + 1} of 2`);
      for (const [side, whose] of [['stored', 'Stored document'], ['yours', 'Your text']] as const) {
        // Names are spoken with their runs of whitespace as one space; the lines are drawn as written.
        await expect(version(conflict, side)).toHaveAccessibleName(`${whose}, line ${at * 2 + 2} ${lines[side][letter].replace(/\s+/g, ' ')}`);
        expect(await linesShown(version(conflict, side))).toEqual([lines[side][letter]]);
        await expect(version(conflict, side)).toHaveAttribute('aria-pressed', 'false');
      }
    }
    await version(view.conflicts.nth(0), first).click();
    await version(view.conflicts.nth(1), second).click();
    await expect(version(view.conflicts.nth(0), first)).toHaveAttribute('aria-pressed', 'true');
    expect(await storedDocument(extension)).toBe(stored);
    await broughtInAndSaved(extension, view, `a  https://a/\n${lines[first].b}\nc  https://c/\n${lines[second].d}\ne  https://e/\nadded  https://added/\n`);
  });
}

test('a document changed again after the change was brought in is refused again, nothing overwritten; brought in again, Save stores all three changes', async ({ extension }) => {
  const original = 'a  https://a/\n';
  await extension.seedStorage({ mappings: original });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'mine  https://mine/\n');
  expect(await extension.sendRequest({ ...INSERT, name: 'first' })).toMatchObject({ kind: 'applied' });
  const first = (await storedDocument(extension)) as string;
  await refused(extension, view, first);
  await view.bringIn.click();
  await expect(view.area).toHaveValue(`${first}mine  https://mine/\n`);

  expect(await extension.sendRequest({ ...INSERT, name: 'second' })).toMatchObject({ kind: 'applied' });
  const second = (await storedDocument(extension)) as string;
  expect(second).toBe(`${first}second https://other.example/\n`);
  // The merged text, holding unsaved changes, is not replaced by the change that landed.
  await expect(view.area).toHaveValue(`${first}mine  https://mine/\n`);
  await refused(extension, view, second);
  await broughtInAndSaved(extension, view, `${second}mine  https://mine/\n`);
});

test('on a CRLF document whose other change is an insert, which keeps CRLF, the Save after the change is brought in stores', async ({ extension }) => {
  const original = 'a  https://a/\r\nb  https://b/\r\n';
  await extension.seedStorage({ mappings: original });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'mine  https://mine/\n');
  expect(await extension.sendRequest({ ...INSERT, name: 'other' })).toMatchObject({ kind: 'applied' });
  const inserted = (await storedDocument(extension)) as string;
  expect(inserted).toBe(`${original}other https://other.example/\r\n`);
  await refused(extension, view, inserted);
  await expect(view.conflicts).toHaveCount(0);
  // The base is the reply's text, CRLF and all, so this Save is not refused: it stores what the text area holds.
  await broughtInAndSaved(extension, view, 'a  https://a/\nb  https://b/\nother https://other.example/\nmine  https://mine/\n');
});

test('during the offer the text area takes no typing, the action waits for every version, and the footer says what Enter does at each control', async ({ extension, site }) => {
  const original = 'a  https://a/\nb  https://b/\n';
  await extension.seedStorage({ mappings: original });
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await retypeLine(view, 2, 'b  https://draft/');
  const stored = 'z  https://z/\na  https://a/\nb  https://stored/\n';
  expect(await other.send({ kind: 'replace', text: stored, base: original })).toMatchObject({ kind: 'applied' });
  await refused(extension, view, stored);
  const conflict = view.conflicts.first();
  // The offer takes the focus.
  await expect(version(conflict, 'stored')).toBeFocused();
  await expect(footer(popup)).toHaveText("Enter keeps the stored document's version");

  await view.area.focus();
  await expect(footer(popup)).toHaveText('Enter does nothing until the change is brought in');
  await expect(view.area).not.toBeEditable();
  await popup.keyboard.type('zz');
  await popup.keyboard.press('Enter');
  await expect(view.area).toHaveValue('a  https://a/\nb  https://draft/\n');
  await view.save.focus();
  await expect(footer(popup)).toHaveText('Enter does nothing until the change is brought in');
  await version(conflict, 'yours').focus();
  await expect(footer(popup)).toHaveText('Enter keeps your version');

  await view.bringIn.focus();
  await expect(footer(popup)).toHaveText('Enter does nothing · Choose a version of 1 more part changed in both');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('alert')).toHaveText('Choose a version of 1 more part changed in both.');
  await view.bringIn.click({ force: true });
  await expect(view.area).toHaveValue('a  https://a/\nb  https://draft/\n');
  await expect(view.area).not.toBeEditable();
  await expect(view.status).toHaveText(CHANGED);
  expect(await storedDocument(extension)).toBe(stored);
  await checkFitAndAccessibility(popup);

  await version(conflict, 'yours').click();
  await view.bringIn.focus();
  await expect(footer(popup)).toHaveText('Enter brings the change into your text');
  await expect(popup.getByRole('alert')).toHaveCount(0);
  await popup.keyboard.press('Enter');
  await expect(view.area).toBeFocused();
  await expect(view.area).toBeEditable();
  await expect(footer(popup)).toHaveText('Enter starts a new line');
  await expect(view.area).toHaveValue('z  https://z/\na  https://a/\nb  https://draft/\n');
  expect(await storedDocument(extension)).toBe(stored);
});

test('in the popup, the keyboard alone goes from Save through the offer to the stored document', async ({ extension, site }) => {
  const original = 'a  https://a/\nb  https://b/\n';
  await extension.seedStorage({ mappings: original });
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  // The settings opened by a click; from here on, keys alone.
  await expect(view.area).toBeFocused();
  await popup.keyboard.press('Control+End');
  await popup.keyboard.type('mine  https://mine/\n');
  const stored = 'a  https://a/\nb  https://stored/\n';
  expect(await other.send({ kind: 'replace', text: stored, base: original })).toMatchObject({ kind: 'applied' });
  await popup.keyboard.press('Shift+Tab');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await expect(view.save).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter saves the text');
  await popup.keyboard.press('Enter');
  await expect(view.status).toHaveText(CHANGED);
  // No line both changed: the action alone, focused.
  await expect(view.bringIn).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter brings the change into your text');
  await popup.keyboard.press('Enter');
  await expect(view.area).toBeFocused();
  await expect(view.area).toHaveValue('a  https://a/\nb  https://stored/\nmine  https://mine/\n');
  await popup.keyboard.press('Tab');
  await expect(view.save).toBeFocused();
  await popup.keyboard.press('Enter');
  await expect(view.status).toHaveText('Saved');
  expect(await storedDocument(extension)).toBe('a  https://a/\nb  https://stored/\nmine  https://mine/\n');
});

test('after the change is brought in, the text area is editable, the status says the text is not stored until Save, and a change landing then leaves the text alone', async ({ extension }) => {
  const original = 'a  https://a/\n';
  await extension.seedStorage({ mappings: original });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'mine  https://mine/\n');
  expect(await extension.sendRequest({ ...INSERT, name: 'first' })).toMatchObject({ kind: 'applied' });
  await refused(extension, view, (await storedDocument(extension)) as string);
  await view.bringIn.click();
  const merged = 'a  https://a/\nfirst https://other.example/\nmine  https://mine/\n';
  await expect(view.area).toHaveValue(merged);
  await expect(view.area).toBeEditable();
  await expect(view.status).toHaveText(MERGED);
  await expect(view.offer).toHaveCount(0);
  expect(await extension.sendRequest({ ...INSERT, name: 'later' })).toMatchObject({ kind: 'applied' });
  // A read made now is answered after the one the view made on hearing of the change.
  await view.page.evaluate(() => chrome.storage.local.get('mappings'));
  await expect(view.area).toHaveValue(merged);
  await expect(view.status).toHaveText(MERGED);
  await typeAtEnd(view, 'more  https://more/\n');
  await expect(view.status).toHaveText(MERGED);
});

test('a merged text whose lines repeat a name lists the repeat by its line at the next Save, which stores nothing', async ({ extension }) => {
  const original = 'a  https://a/\nb  https://b/\n';
  await extension.seedStorage({ mappings: original });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'x  https://draft-x/\n');
  const stored = `x  https://stored-x/\n${original}`;
  expect(await extension.sendRequest({ kind: 'replace', text: stored, base: original })).toMatchObject({ kind: 'applied' });
  await refused(extension, view, stored);
  await expect(view.conflicts).toHaveCount(0);
  await view.bringIn.click();
  await expect(view.area).toHaveValue(`${stored}x  https://draft-x/\n`);
  await view.save.click();
  await expect(view.status).toHaveText('Not saved');
  await expect(view.errors).toHaveText(['Line 4: expected a name of its own, but line 1 has this name']);
  expect(await storedDocument(extension)).toBe(stored);
});

const STATES_BASE = 'a  https://a/\nb  https://b/\nc  https://c/\n';

/**
 * Reaches in `view` each state of the offer, then the merged text, with `check` run on each: the offer with no
 * part changed in both; two parts, one chosen; versions holding a 2,000-character line; a version with no
 * lines. Each starts from the document `STATES_BASE`, its other change sent by `send`, and ends saved.
 */
async function eachOfferState(extension: LoadedExtension, view: TextView, send: (request: Request) => Promise<unknown>, check: () => Promise<void>) {
  const long = 'x'.repeat(2_000);
  const states = [
    { draft: `${STATES_BASE}mine  https://mine/\n`, stored: `z  https://z/\n${STATES_BASE}`, choose: [] },
    { draft: 'a  https://draft-a/\nb  https://b/\nc  https://draft-c/\n', stored: 'a  https://stored-a/\nb  https://b/\nc  https://stored-c/\n', choose: ['stored'] },
    { draft: `a  https://draft.example/${long}\nb  https://b/\nc  https://c/\n`, stored: `a  https://stored.example/${long}\nb  https://b/\nc  https://c/\n`, choose: [] },
    { draft: 'a  https://a/\nb  https://draft-b/\nc  https://c/\n', stored: 'a  https://a/\nc  https://c/\n', choose: [] },
  ] as const;
  for (const { draft, stored, choose } of states) {
    // Nothing typed since the last Save, the view takes in the document seeded.
    await extension.seedStorage({ mappings: STATES_BASE });
    await expect(view.area).toHaveValue(STATES_BASE);
    await view.area.evaluate((area: HTMLTextAreaElement) => area.select());
    await view.area.page().keyboard.insertText(draft);
    expect(await send({ kind: 'replace', text: stored, base: STATES_BASE })).toMatchObject({ kind: 'applied' });
    await refused(extension, view, stored);
    for (const [at, side] of choose.entries()) await version(view.conflicts.nth(at), side).click();
    await check();
    const conflicts = await view.conflicts.count();
    for (let at = choose.length; at < conflicts; at++) await version(view.conflicts.nth(at), 'yours').click();
    await view.bringIn.click();
    await view.save.click();
    await expect(view.status).toHaveText('Saved');
  }
  await extension.seedStorage({ mappings: STATES_BASE });
  await expect(view.area).toHaveValue(STATES_BASE);
  await typeAtEnd(view, 'mine  https://mine/\n');
  expect(await send({ ...INSERT, name: 'other' })).toMatchObject({ kind: 'applied' });
  await refused(extension, view, `${STATES_BASE}other https://other.example/\n`);
  await view.bringIn.click();
  await expect(view.status).toHaveText(MERGED);
  await check();
}

test('every state of the offer and the merged text in the popup fits and passes the accessibility pass', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await eachOfferState(extension, view, (request) => other.send(request), () => checkFitAndAccessibility(popup));
});

test("every state of the offer and the merged text on the options page passes the accessibility pass in both schemes", async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a  https://a/\n' });
  const view = await textViewOnOptionsPage(extension);
  await eachOfferState(extension, view, (request) => extension.sendRequest(request), () => checkAccessibilityInBothSchemes(view.page));
});

// In search, a row is selected only while it is whole in view (G3): drawn and named as selected, and acted on
// by Enter, Shift+Enter, and Ctrl+E (G4, G5, P1). Search's view scrolls with what it holds, here a long *This
// page is "‹name›"* below seven rows, and the user may scroll it: by its own Tab stop with PageDown, Space, or
// End, by the wheel, or by Tab to a control further down, which Chrome scrolls into view (G32). The view stays
// where they took it (G7); a selected row it leaves is held back, nothing selected and the footer saying Enter
// does nothing (L2), until the row is whole in view again, or Up, Down, a new list, or the search box's focus
// brings it there. Every state fits and passes the accessibility pass.
import type { Locator, Page } from '@playwright/test';
import { checkFitAndAccessibility, closingPopup, expect, focusDrawn, popupOnNewPage, rowEditor, test, thisPagePencil, watchRequests, type LoadedExtension, type LocalSite, type RequestPage } from './extension.ts';

const HELD_BACK = 'Enter does nothing · Up or Down selects a row';
const OPENS = 'Enter opens it in a new tab · Shift+Enter in this tab';

const view = (popup: Page) => popup.locator('.view');
const searchBox = (popup: Page) => popup.getByRole('combobox');
const footer = (popup: Page) => popup.locator('footer');
const selected = (popup: Page) => popup.locator('[role=option][aria-selected=true]');
const scrollTop = (popup: Page) => view(popup).evaluate((element) => element.scrollTop);
const urlOf = (name: string) => `https://${name}.example.com/`;

/** Whether `target` is whole inside search's view, within half a pixel (layout rounds), or, taller than the view, fills it. */
function inView(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const area = document.querySelector('.view')!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return (box.top >= area.top - 0.5 && box.bottom <= area.bottom + 0.5) || (box.top <= area.top + 0.5 && box.bottom >= area.bottom - 0.5);
  });
}

/** Fails unless the selected row is `name` and whole in view, and the search box names it as its active row. */
async function expectSelected(popup: Page, name: string) {
  await expect(selected(popup).locator('.row-name')).toHaveText(name);
  expect(await inView(selected(popup))).toBe(true);
  await expect(searchBox(popup)).toHaveAttribute('aria-activedescendant', (await selected(popup).getAttribute('id'))!);
}

/** Fails unless no row is selected, drawn or named, and the footer says Enter does nothing. */
async function expectHeldBack(popup: Page) {
  await expect(selected(popup)).toHaveCount(0);
  await expect(searchBox(popup)).not.toHaveAttribute('aria-activedescendant');
  await expect(footer(popup)).toHaveText(HELD_BACK);
}

/** Waits until the view's scroll has stopped moving, as a smooth scroll does a few frames after its key. */
async function settled(popup: Page) {
  let last = -1;
  await expect
    .poll(async () => {
      const now = await scrollTop(popup);
      const still = now === last;
      last = now;
      return still;
    }, { intervals: [200] })
    .toBe(true);
}

interface Search {
  extension: LoadedExtension;
  page: Page;
  popup: Page;
  /** The jumps the worker has received. */
  jumps: () => Promise<unknown[]>;
  /** A page of the extension to send requests from, opened before the popup. */
  other: RequestPage;
}

/**
 * Search with `prefix`1 to `prefix`8 and the page's own mapping, named with `letters` letters (none for 0),
 * with `typed` typed and its first row selected and whole in view.
 */
async function search(extension: LoadedExtension, site: LocalSite, { prefix = 'm', letters = 700, typed = 'm' } = {}): Promise<Search> {
  const jumps = await watchRequests(extension.worker, 'jump');
  // A tab opened while the popup is open can close it.
  const other = await extension.openRequestPage();
  const { page, popup } = await popupOnNewPage(extension, site);
  const lines = Array.from({ length: 8 }, (_, i) => `${prefix}${i + 1}                   ${urlOf(`${prefix}${i + 1}`)}\n`).join('');
  await extension.seedStorage({ mappings: letters === 0 ? lines : `${lines}n${'x'.repeat(letters - 1)}  ${page.url()}\n` });
  await expect(popup.getByRole('option').first()).toBeVisible();
  await popup.keyboard.type(typed);
  await expectSelected(popup, `${prefix}1`);
  return { extension, page, popup, jumps, other };
}

/** Whether search's view scrolls. */
const viewScrolls = (popup: Page) => view(popup).evaluate((element) => element.scrollHeight > element.clientHeight);

/** Tab from the search box until `control` has the focus. */
async function tabTo(popup: Page, control: Locator) {
  for (let i = 0; i < 16 && !(await control.evaluate((element) => element === document.activeElement)); i++) await popup.keyboard.press('Tab');
  await expect(control).toBeFocused();
}

/**
 * Presses each of `keys` and fails unless none opened or edited anything: no jump reached the worker, no tab
 * opened, no use was recorded, the popup stayed open in search, and the view stayed where it was.
 */
async function expectKeysDoNothing({ extension, popup, jumps }: Search, keys = ['Enter', 'Shift+Enter', 'Control+e']) {
  const [tabs, usage, top] = [await extension.tabUrls(), (await extension.readStorage()).usage, await scrollTop(popup)];
  for (const key of keys) await popup.keyboard.press(key);
  await popup.waitForTimeout(300);
  expect(await jumps()).toEqual([]);
  expect(await extension.tabUrls()).toEqual(tabs);
  expect((await extension.readStorage()).usage).toEqual(usage);
  expect(await extension.openPopups()).toBe(1);
  await expect(rowEditor(popup).name).toHaveCount(0);
  expect(await scrollTop(popup)).toBe(top);
}

/** Presses Enter, which opens `name`'s URL in a new tab and closes the popup. */
async function expectEnterOpens({ extension, popup }: Search, name: string) {
  await closingPopup(popup, () => popup.keyboard.press('Enter'));
  await expect.poll(() => extension.tabUrls()).toContain(urlOf(name));
}

/** The pointer over the part of *This page is* the unscrolled view shows, below the rows. */
async function pointAtThisPage(popup: Page) {
  const [x, y] = await popup.evaluate(() => {
    const [text, area] = [document.querySelector('.this-page')!.getBoundingClientRect(), document.querySelector('.view')!.getBoundingClientRect()];
    return [text.left + 20, Math.min(text.top + 5, area.bottom - 5)];
  });
  expect(await popup.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.this-page') !== null, [x, y])).toBe(true);
  await popup.mouse.move(x!, y!);
}

/** Scrolls the view to its end by the wheel over *This page is*, the focus left in the search box. */
async function wheelPastTheRows(popup: Page) {
  await pointAtThisPage(popup);
  await popup.mouse.wheel(0, 600);
  await expectHeldBack(popup);
  await settled(popup);
}

test("PageDown on the view's own Tab stop holds the selection back: Enter, Shift+Enter, and Ctrl+E act on nothing, and the view stays; PageUp shows it again and Enter opens it", async ({ extension, site }) => {
  const opened = await search(extension, site);
  const { popup } = opened;
  expect(await viewScrolls(popup)).toBe(true);
  // Chrome makes the scrolling view a Tab stop after the chip and the gear.
  for (let i = 0; i < 3; i++) await popup.keyboard.press('Tab');
  await expect(view(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText(OPENS);
  await popup.keyboard.press('PageDown');
  await expectHeldBack(popup);
  await settled(popup);
  const top = await scrollTop(popup);
  expect(top).toBeGreaterThan(0);
  await expectKeysDoNothing(opened);
  await expectHeldBack(popup);

  // The pass scrolls the view as it walks and gives the scroll back: the selection comes out held back still.
  await checkFitAndAccessibility(popup);
  expect(await scrollTop(popup)).toBe(top);
  await expect(view(popup)).toBeFocused();
  await expectKeysDoNothing(opened);
  await expectHeldBack(popup);

  await popup.keyboard.press('PageUp');
  await expect(selected(popup)).toHaveCount(1);
  await settled(popup);
  await expectSelected(popup, 'm1');
  await expect(footer(popup)).toHaveText(OPENS);
  await checkFitAndAccessibility(popup);
  await expectEnterOpens(opened, 'm1');
});

test("Space and End on the view's own Tab stop hold the selection back as PageDown does; after End the end of This page is is in view", async ({ extension, site }) => {
  const opened = await search(extension, site);
  const { popup } = opened;
  for (let i = 0; i < 3; i++) await popup.keyboard.press('Tab');
  await expect(view(popup)).toBeFocused();
  for (const key of ['Space', 'End']) {
    await popup.keyboard.press(key);
    await expectHeldBack(popup);
    await settled(popup);
    await expectKeysDoNothing(opened);
    await checkFitAndAccessibility(popup);
    await expectHeldBack(popup);
    if (key === 'End') expect(await inView(popup.locator('.this-page'))).toBe(true);
    await popup.keyboard.press('Home');
    await expect(selected(popup)).toHaveCount(1);
    await settled(popup);
    await expectSelected(popup, 'm1');
  }
  await expectEnterOpens(opened, 'm1');
});

test('the wheel over This page is holds the selection back with the focus in the search box; the wheel back up shows it again', async ({ extension, site }) => {
  const opened = await search(extension, site);
  const { popup } = opened;
  await wheelPastTheRows(popup);
  await expect(searchBox(popup)).toBeFocused();
  await expectKeysDoNothing(opened);
  const top = await scrollTop(popup);
  // The pass ends by giving the search box its focus back, then the view its scroll: Enter at once still acts on nothing.
  await checkFitAndAccessibility(popup);
  expect(await scrollTop(popup)).toBe(top);
  await expectKeysDoNothing(opened, ['Enter']);
  await expectHeldBack(popup);

  await popup.mouse.wheel(0, -600);
  await expect(selected(popup)).toHaveCount(1);
  await settled(popup);
  await expectSelected(popup, 'm1');
  await expect(searchBox(popup)).toBeFocused();
  await expectEnterOpens(opened, 'm1');
});

test("Tab to This page is's pencil scrolls the view to the pencil and holds the selection back; back in the search box the row is selected and in view", async ({ extension, site }) => {
  const opened = await search(extension, site);
  const { popup } = opened;
  await tabTo(popup, thisPagePencil(popup));
  await expect(thisPagePencil(popup)).toBeInViewport({ ratio: 1 });
  expect(await inView(thisPagePencil(popup))).toBe(true);
  await expect(footer(popup)).toHaveText('Enter edits line 9');
  await expect(selected(popup)).toHaveCount(0);
  await expect(searchBox(popup)).not.toHaveAttribute('aria-activedescendant');
  expect(await focusDrawn(popup)).toBe(true);
  await thisPagePencil(popup).focus();
  await checkFitAndAccessibility(popup);
  await expect(thisPagePencil(popup)).toBeFocused();
  await expect(selected(popup)).toHaveCount(0);

  await popup.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();
  // Tab from the last control wraps through Chrome's own frame and lands after the key has come up.
  await popup.keyboard.press('Tab');
  await expect(searchBox(popup)).toBeFocused();
  await expectSelected(popup, 'm1');
  await expect(footer(popup)).toHaveText(OPENS);
  await expectEnterOpens(opened, 'm1');
});

test('a row cut at the edge of the view is not selected, nor is the next row in view; Down selects that next row without scrolling', async ({ extension, site }) => {
  const opened = await search(extension, site);
  const { popup } = opened;
  // The view scrolled 10 pixels past the top of m1, which m2 below it leaves whole.
  const cut = await popup.evaluate(() => {
    const area = document.querySelector('.view')!;
    area.scrollTop = document.getElementById('row-0')!.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop + 10;
    return area.scrollTop;
  });
  await expectHeldBack(popup);
  expect(await inView(popup.locator('#row-1'))).toBe(true);
  await expectKeysDoNothing(opened);
  await checkFitAndAccessibility(popup);
  await expectHeldBack(popup);

  await view(popup).evaluate((element) => (element.scrollTop = 0));
  await expect(selected(popup)).toHaveCount(1);
  await expectSelected(popup, 'm1');

  await view(popup).evaluate((element, cut) => (element.scrollTop = cut), cut);
  await expectHeldBack(popup);
  await popup.keyboard.press('ArrowDown');
  await expectSelected(popup, 'm2');
  expect(await scrollTop(popup)).toBe(cut);
  await checkFitAndAccessibility(popup);
  await expectEnterOpens(opened, 'm2');
});

test('Up from a selection held back wraps to the last row, the window following it into view', async ({ extension, site }) => {
  const opened = await search(extension, site);
  const { popup } = opened;
  for (let i = 0; i < 3; i++) await popup.keyboard.press('Tab');
  await popup.keyboard.press('PageDown');
  await expectHeldBack(popup);
  await settled(popup);
  await popup.keyboard.press('ArrowUp');
  await expectSelected(popup, 'm8');
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['m2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);
  await expect(view(popup)).toBeFocused();
  await checkFitAndAccessibility(popup);
  await expectEnterOpens(opened, 'm8');
});

test('in a one-row list scrolled out of view, Down selects that row and brings it into view', async ({ extension, site }) => {
  // A name long enough that the view scrolls below one row, its text still shorter than the view.
  const opened = await search(extension, site, { letters: 900, typed: 'm1' });
  const { popup } = opened;
  await expect(popup.getByRole('option')).toHaveCount(1);
  expect(await viewScrolls(popup)).toBe(true);
  expect(await popup.evaluate(() => document.querySelector('.this-page')!.getBoundingClientRect().height < document.querySelector('.view')!.clientHeight)).toBe(true);
  await wheelPastTheRows(popup);
  await popup.keyboard.press('ArrowDown');
  await expectSelected(popup, 'm1');
  await checkFitAndAccessibility(popup);
  await expectEnterOpens(opened, 'm1');
});

test('a new list for more typed text comes with its first row selected and in view, though its rows are the same', async ({ extension, site }) => {
  const opened = await search(extension, site, { prefix: 'ma' });
  const { popup } = opened;
  await wheelPastTheRows(popup);
  await popup.keyboard.type('a');
  await expectSelected(popup, 'ma1');
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['ma1', 'ma2', 'ma3', 'ma4', 'ma5', 'ma6', 'ma7']);
  await checkFitAndAccessibility(popup);
  await expectEnterOpens(opened, 'ma1');
});

test("another page's change that alters the rows comes with the first row selected and in view, also over a selection held back", async ({ extension, site }) => {
  const { popup, other } = await search(extension, site);
  await wheelPastTheRows(popup);
  expect(await other.send({ kind: 'insert', name: 'm', url: 'https://m.test/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
  await expectSelected(popup, 'm');
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['m', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  await checkFitAndAccessibility(popup);
});

test("with the focus on This page is's pencil, another page's change leaves the view where it was when the rows stay, and brings the new first row into view when they change", async ({ extension, site }) => {
  const { popup, other } = await search(extension, site);
  await tabTo(popup, thisPagePencil(popup));
  const top = await scrollTop(popup);

  // Not listed for "m": neither its name nor its URL holds an m.
  expect(await other.send({ kind: 'insert', name: 'zz', url: 'https://zz.test/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
  await expect.poll(async () => (await extension.readStorage()).mappings).toContain('zz');
  await popup.waitForTimeout(300);
  expect(await scrollTop(popup)).toBe(top);
  await expect(thisPagePencil(popup)).toBeFocused();
  expect(await inView(thisPagePencil(popup))).toBe(true);
  await expect(selected(popup)).toHaveCount(0);
  await checkFitAndAccessibility(popup);

  expect(await other.send({ kind: 'insert', name: 'm', url: 'https://m.test/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
  await expectSelected(popup, 'm');
  // The focus is on a control whole in view: the pencil if the view still shows it, else the search box.
  const focus = await popup.evaluate(() => (document.activeElement === document.querySelector('.search-box') ? 'search box' : document.activeElement?.closest('.this-page') ? 'pencil' : 'elsewhere'));
  if (focus === 'pencil') expect(await inView(thisPagePencil(popup))).toBe(true);
  else expect(focus).toBe('search box');
  await checkFitAndAccessibility(popup);
});

test('after the accessibility pass on the unscrolled view, Enter pressed at once opens the selected row', async ({ extension, site }) => {
  const opened = await search(extension, site);
  await checkFitAndAccessibility(opened.popup);
  await expectEnterOpens(opened, 'm1');
});

test('in a view shorter than the seven rows, Tab to the last pencil and back keeps the selected row in view; in one shorter than a row, the first row fills it, selected', async ({ extension, site }) => {
  const opened = await search(extension, site, { letters: 0 });
  const { popup } = opened;
  // A block above the view, standing in for a popup made shorter by zoom, leaves the view `height` pixels tall.
  const shorten = (height: number) =>
    popup.evaluate((height) => {
      const area = document.querySelector<HTMLElement>('.view')!;
      let block = document.getElementById('planted');
      if (block === null) {
        block = document.createElement('div');
        block.id = 'planted';
        block.style.flex = 'none';
        block.style.height = '0px';
        area.before(block);
      }
      block.style.height = `${parseFloat(block.style.height) + area.clientHeight - height}px`;
    }, height);
  await shorten(200);
  await expect(view(popup)).toHaveAttribute('tabindex', '0');
  // Seven rows are 322 pixels.
  await expect.poll(() => view(popup).evaluate((element) => element.clientHeight)).toBeLessThan(322);
  await expectSelected(popup, 'm1');
  await checkFitAndAccessibility(popup);

  const lastPencil = popup.locator('.row-pencils').getByRole('button').last();
  await tabTo(popup, lastPencil);
  await expect(lastPencil).toBeInViewport({ ratio: 1 });
  expect(await inView(lastPencil)).toBe(true);
  if ((await selected(popup).count()) > 0) expect(await inView(selected(popup))).toBe(true);
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();
  await popup.keyboard.press('Tab');
  await expect(searchBox(popup)).toBeFocused();
  await expectSelected(popup, 'm1');

  await shorten(30);
  await expect.poll(() => view(popup).evaluate((element) => element.clientHeight)).toBeLessThan(46);
  await searchBox(popup).fill('');
  await expect(selected(popup)).toHaveCount(0);
  await popup.keyboard.type('m');
  await expectSelected(popup, 'm1');
  await checkFitAndAccessibility(popup);
  await expectEnterOpens(opened, 'm1');
});

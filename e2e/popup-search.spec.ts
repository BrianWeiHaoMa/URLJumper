// What the popup lists, as the user types and as storage changes: groups and order (G1, G2), selection and
// the seven-row window (G3, F13), the cue and footer (L2), the theme (F3, F15), and the fit (G7).
import type { Locator, Page } from '@playwright/test';
import { checkFitAndAccessibility, closingPopup, editSelectedRow, expect, popupOnNewPage, shownTheme, test, upgradeNotice, type LoadedExtension } from './extension.ts';

// Mappings named m1 … m<count>, one per line, each at the address `url` gives it.
const mappings = (count: number, url = (i: number) => `https://m${i}.example/`) =>
  Array.from({ length: count }, (_, i) => `m${i + 1}                   ${url(i + 1)}\n`).join('');

const names = (popup: Page) => popup.locator('[role=option] .row-name').allTextContents();
const selected = (popup: Page) => popup.locator('[role=option][aria-selected=true]');
const footer = (popup: Page) => popup.locator('footer');
const cue = (popup: Page) => popup.locator('.cue');

// The open tabs but the extension's own pages.
async function pageTabs(extension: LoadedExtension) {
  return (await extension.tabUrls()).filter((url) => !url.startsWith(extension.url('')));
}

test('a blank box lists the first seven mappings in line order with nothing selected; Enter opens nothing; Down selects row 1', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: mappings(20) });
  const { popup } = await popupOnNewPage(extension, site);
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
  expect(await names(popup)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
  await expect(selected(popup)).toHaveCount(0);
  await expect(cue(popup)).toHaveText('13 more below');
  await checkFitAndAccessibility(popup);

  const tabs = await pageTabs(extension);
  await popup.keyboard.press('Enter');
  await popup.waitForTimeout(500);
  expect(await pageTabs(extension)).toEqual(tabs);
  expect('usage' in (await extension.readStorage())).toBe(false);
  expect(await extension.openPopups()).toBe(1);
  // Up selects nothing: only Down does.
  await popup.keyboard.press('ArrowUp');
  await expect(selected(popup)).toHaveCount(0);
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');

  await popup.keyboard.press('ArrowDown');
  await expect(selected(popup).locator('.row-name')).toHaveText('m1');
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  await checkFitAndAccessibility(popup);

  // The blank list holds every mapping, in line order: Down walks all twenty, then wraps to the first.
  const walked = [await selected(popup).locator('.row-name').textContent()];
  for (let i = 2; i <= 21; i++) {
    await popup.keyboard.press('ArrowDown');
    await expect(selected(popup)).toHaveAttribute('aria-posinset', String(i > 20 ? 1 : i));
    walked.push(await selected(popup).locator('.row-name').textContent());
    if (i === 10) {
      // The window off both ends of the list.
      await expect(cue(popup)).toHaveText('3 more above · 10 more below');
      await checkFitAndAccessibility(popup);
    }
  }
  expect(walked).toEqual([...Array.from({ length: 20 }, (_, i) => `m${i + 1}`), 'm1']);
});

test('each new list selects its first row: typed s, Down twice, then t', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'sa  https://sa.example/\nsb  https://sb.example/\nst  https://st.example/\nstocks  https://stocks.example/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('s');
  await expect(selected(popup).locator('.row-name')).toHaveText('sa');
  await popup.keyboard.press('ArrowDown');
  await popup.keyboard.press('ArrowDown');
  await expect(selected(popup).locator('.row-name')).toHaveText('st');
  await popup.keyboard.type('t');
  await expect.poll(() => names(popup)).toEqual(['st', 'stocks']);
  await expect(selected(popup).locator('.row-name')).toHaveText('st');
  await expect(selected(popup)).toHaveAttribute('aria-posinset', '1');
  // A keystroke that leaves the same rows is a new list too.
  await popup.keyboard.press('ArrowDown');
  await expect(selected(popup).locator('.row-name')).toHaveText('stocks');
  await popup.keyboard.type(' ');
  await expect(selected(popup).locator('.row-name')).toHaveText('st');
});

test('Up and Down wrap through every match and the window follows; the wheel moves the window and a click opens a row', async ({ extension, site }) => {
  const urls = Array.from({ length: 20 }, (_, i) => site.pageUrl(`Mapping ${i + 1}`));
  await extension.seedStorage({ mappings: mappings(20, (i) => urls[i - 1]!) });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('m');
  await expect(selected(popup).locator('.row-name')).toHaveText('m1');

  await popup.keyboard.press('ArrowUp');
  await expect(selected(popup).locator('.row-name')).toHaveText('m20');
  await expect(selected(popup)).toBeInViewport({ ratio: 1 });
  expect(await names(popup)).toEqual(['m14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20']);
  await expect(cue(popup)).toHaveText('13 more above');
  await expect(popup.getByRole('combobox')).toHaveAttribute('aria-activedescendant', 'row-19');

  await popup.keyboard.press('ArrowDown');
  await expect(selected(popup).locator('.row-name')).toHaveText('m1');
  expect(await names(popup)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
  await expect(cue(popup)).toHaveText('13 more below');

  // A pointer alone reaches every row.
  await popup.getByRole('listbox').hover();
  for (let i = 0; i < 20 && !(await names(popup)).includes('m20'); i++) await popup.mouse.wheel(0, 100);
  expect(await names(popup)).toEqual(['m14', 'm15', 'm16', 'm17', 'm18', 'm19', 'm20']);
  await expect(cue(popup)).toHaveText('13 more above');
  await expect(selected(popup)).toBeInViewport({ ratio: 1 });
  const before = new Set(extension.context.pages());
  await closingPopup(popup, () => popup.getByRole('option', { name: /^m20 / }).click());
  await expect.poll(() => extension.context.pages().filter((page) => !before.has(page)).map((page) => page.url())).toEqual([urls[19]]);
});

test('long names and URLs are shown from their start and cut with an ellipsis; the popup keeps its footer in view and its rows whole', async ({ extension, site }) => {
  const lines = Array.from({ length: 20 }, (_, i) => `n${i + 1}${'w'.repeat(298)}  https://example.com/${i + 1}${'p'.repeat(280)}\n`);
  await extension.seedStorage({ mappings: lines.join('') });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('n');
  await expect(popup.getByRole('option')).toHaveCount(7);
  await expect(cue(popup)).toHaveText('13 more below');

  const shown = () =>
    popup.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const view = box('.view');
      return {
        footerInView: box('footer').bottom <= innerHeight && box('footer').top >= 0,
        noPageOverflow: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
        viewScrolls: getComputedStyle(document.querySelector('.view')!).overflowY === 'auto',
        viewFits: document.querySelector('.view')!.scrollHeight <= document.querySelector('.view')!.clientHeight,
        // Within half a pixel: layout rounds.
        selectedInView: (() => {
          const row = document.querySelector('[role=option][aria-selected=true]')!.getBoundingClientRect();
          return row.top >= view.top - 0.5 && row.bottom <= view.bottom + 0.5;
        })(),
        cueInView: box('.cue').bottom <= view.bottom && box('.cue').top >= view.top,
        texts: [...document.querySelectorAll<HTMLElement>('[role=option] .row-name, [role=option] .row-url')].map((text) => ({
          oneLine: ['pre', 'nowrap'].includes(getComputedStyle(text).whiteSpace) && text.getBoundingClientRect().height < 1.5 * parseFloat(getComputedStyle(text).lineHeight),
          cutWithEllipsis: text.scrollWidth > text.clientWidth && getComputedStyle(text).textOverflow === 'ellipsis',
          fromStart: text.scrollLeft === 0 && /^(?:n\d+w|https:\/\/example\.com\/\d+p)/.test(text.textContent ?? ''),
        })),
        // Everything else of the popup's own is whole.
        uncut: [...document.querySelectorAll<HTMLElement>('.chip, .cue, footer, .row-tag, .message')].every((element) => element.scrollWidth <= element.clientWidth),
      };
    });
  const whole = { footerInView: true, noPageOverflow: true, viewScrolls: true, viewFits: true, selectedInView: true, cueInView: true, uncut: true };
  const eachText = { oneLine: true, cutWithEllipsis: true, fromStart: true };
  let state = await shown();
  expect(state).toMatchObject(whole);
  expect(state.texts).toEqual(Array(14).fill(eachText));
  for (let i = 0; i < 6; i++) await popup.keyboard.press('ArrowDown');
  await expect(selected(popup).locator('.row-name')).toHaveText(/^n7w/);
  expect(await shown()).toMatchObject(whole);
  await checkFitAndAccessibility(popup);

  // Content taller than the viewport Chrome allows, as at a larger zoom: the root takes the viewport's
  // height, the footer stays in view, and the view scrolls to keep the selected row visible.
  await popup.evaluate(() => {
    const tall = document.createElement('div');
    tall.style.height = '700px';
    document.querySelector('.view-content')!.prepend(tall);
  });
  await expect.poll(() => popup.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  for (let i = 0; i < 6; i++) await popup.keyboard.press('ArrowDown');
  await expect(selected(popup).locator('.row-name')).toHaveText(/^n13w/);
  state = await shown();
  // The cue scrolled out with the rest of the view is not cut off: the view scrolls to it.
  expect(state).toMatchObject({ ...whole, viewFits: false, cueInView: false });
  expect(await popup.evaluate(() => document.querySelector('.view')!.scrollHeight > document.querySelector('.view')!.clientHeight)).toBe(true);

  // The content fits again: the popup is as tall as its content, with no height of its own left over.
  await popup.evaluate(() => document.querySelector('.view-content')!.firstElementChild!.remove());
  await expect
    .poll(() =>
      popup.evaluate(() => {
        const height = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().height;
        return Math.abs(innerHeight - (height('.search-bar') + height('.view-content') + height('.page-bar') + height('footer'))) < 1;
      }),
    )
    .toBe(true);
});

test('a long name in a right-to-left script is shown from its start, in its row and above its editor', async ({ extension, site }) => {
  // Its start is its first character, which a right-to-left line draws at its right (E8).
  const name = `بداية${'س'.repeat(300)}نهاية`;
  await extension.seedStorage({ mappings: `${name}  https://a.example/\n` });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.getByRole('combobox').fill('بداية');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await checkFitAndAccessibility(popup);
  await editSelectedRow(popup);
  await expect(popup.locator('.editor-header .row-name')).toHaveText(name);
  await checkFitAndAccessibility(popup);
});

test('text in a right-to-left script that names no mapping is shown in the Name row whole when it fits, else from its start', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'a  https://a.example/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  for (const typed of ['مرحبا', `يس${'س'.repeat(300)}`]) {
    await popup.getByRole('combobox').fill(typed);
    await expect(selected(popup)).toHaveAccessibleName(`Name "${typed}" for this page`);
    await checkFitAndAccessibility(popup);
  }
});

test('a name or URL that fits its row is shown whole, however many code units it holds', async ({ extension, site }) => {
  // Zero-width joiners take code units and no width.
  const joiners = '\u200d'.repeat(1100);
  const name = `a${joiners}TAIL`;
  const url = `https://example.com/${joiners}TAIL`;
  await extension.seedStorage({ mappings: `${name}  ${url}\n` });
  const { popup } = await popupOnNewPage(extension, site);
  await expect(popup.getByRole('option')).toHaveCount(1);
  const shown = await popup.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.row-name, .row-url')].map((text) => [text.textContent, text.scrollWidth > text.clientWidth]),
  );
  expect(shown).toEqual([
    [name, false],
    [url, false],
  ]);
});

test('a name or URL in a script whose marks rise above or fall below the line is shown whole, and so is the same text typed', async ({ extension, site }) => {
  // Thai stacks tone marks above its letters and gives ฎ and ฏ tails below them; Vietnamese stacks marks on capitals.
  const texts = ['ปั้นฎฏ', 'Ỗộở Ữ'];
  await extension.seedStorage({ mappings: texts.map((text, i) => `${text}  https://${text.replace(' ', '')}.example/${i}\n`).join('') });
  const { popup } = await popupOnNewPage(extension, site);
  await expect(popup.getByRole('option')).toHaveCount(2);
  // Each text as the popup draws it, against the same text with nothing around it allowed to cut it.
  // `inset` leaves out a box's rounded corners, which can draw a pixel apart once its style changes.
  const drawnWhole = async (target: Locator, uncut: (element: HTMLElement) => void, inset = 0) => {
    const box = (await target.boundingBox())!;
    const clip = { x: box.x + inset, y: box.y - 12, width: box.width - 2 * inset, height: box.height + 24 };
    const drawn = await popup.screenshot({ clip, caret: 'hide' });
    await target.evaluate(uncut);
    const whole = await popup.screenshot({ clip, caret: 'hide' });
    await target.evaluate((element) => element.removeAttribute('style'));
    return drawn.equals(whole);
  };
  for (const text of await popup.locator('[role=option] .row-name, [role=option] .row-url').all()) {
    expect(await drawnWhole(text, (element) => (element.style.overflow = 'visible')), (await text.textContent()) ?? '').toBe(true);
  }
  for (const typed of texts) {
    await popup.getByRole('combobox').fill(typed);
    // A taller line box, in a box of the same height, leaves the typed text the same room as anything drawn around it.
    expect(await drawnWhole(popup.getByRole('combobox'), (element) => (element.style.cssText = 'line-height: 32px; padding-block: 0'), 6), typed).toBe(true);
  }
});

test('a popup opened on one row grows to show seven when the list grows', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: mappings(1) });
  const { popup } = await popupOnNewPage(extension, site);
  await expect(popup.getByRole('option')).toHaveCount(1);
  const small = await popup.evaluate(() => innerHeight);
  await extension.seedStorage({ mappings: mappings(20) });
  await expect(popup.getByRole('option')).toHaveCount(7);
  await expect
    .poll(() => popup.evaluate(() => [innerHeight > document.querySelector('.rows')!.getBoundingClientRect().bottom, document.documentElement.scrollHeight <= innerHeight]))
    .toEqual([true, true]);
  expect(await popup.evaluate(() => innerHeight)).toBeGreaterThan(small);
  await expect(cue(popup)).toBeInViewport({ ratio: 1 });
});

test('a mapping found only by its address is listed as an address match, visibly and by name', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\ndev  http://localhost:5173/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('localhost');
  // No name holds the text, so the Name row follows the address match (G1 (f)).
  await expect(popup.getByRole('option')).toHaveCount(2);
  await expect(popup.getByRole('option').last()).toHaveAccessibleName('Name "localhost" for this page');
  await expect(popup.getByRole('option').locator('.row-tag')).toHaveText('address match');
  await expect(popup.getByRole('option', { name: 'dev address match http://localhost:5173/', exact: true })).toBeVisible();
  await expect(selected(popup).locator('.row-name')).toHaveText('dev');
  await checkFitAndAccessibility(popup);
});

test('an argument alias without an argument shows its %s marked and the hint; the argument row shows the filled URL', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'yt                   https://www.youtube.com/results?search_query=%s\nyard  https://yard.example/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('y');
  const alias = popup.getByRole('option', { name: /^yt / });
  await expect(alias.locator('.row-url')).toHaveText('https://www.youtube.com/results?search_query=%s');
  await expect(alias.locator('mark')).toHaveText('%s');
  await expect(alias.locator('.row-tag')).toHaveText('Space and text fill %s');
  await expect(popup.getByRole('option', { name: /^yard / }).locator('.row-tag')).toHaveCount(0);
  await expect(footer(popup)).toHaveText('Enter opens it with %s empty in a new tab · Shift+Enter in this tab');
  await checkFitAndAccessibility(popup);

  // `yt` itself, the alias alone: still marked and hinted.
  await popup.keyboard.type('t');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await expect(alias.locator('.row-url')).toHaveText('https://www.youtube.com/results?search_query=%s');
  await expect(alias.locator('mark')).toHaveText('%s');
  await expect(alias.locator('.row-tag')).toHaveText('Space and text fill %s');
  await expect(footer(popup)).toHaveText('Enter opens it with %s empty in a new tab · Shift+Enter in this tab');

  await popup.keyboard.type(' lo-fi beats');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await expect(popup.getByRole('option').locator('.row-url')).toHaveText('https://www.youtube.com/results?search_query=lo-fi%20beats');
  await expect(popup.getByRole('option').locator('mark, .row-tag')).toHaveCount(0);
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  await checkFitAndAccessibility(popup);
});

test("a row's tag stays whole beside a name or URL long enough to be cut", async ({ extension, site }) => {
  const long = 'w'.repeat(300);
  await extension.seedStorage({ mappings: `q${long}  https://q.example/${long}?q=%s\nother${long}  https://x.example/q${long}\n` });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('q');
  await expect(popup.getByRole('option').locator('.row-tag')).toHaveText(['Space and text fill %s', 'address match']);
  const cut = await popup.locator('.row-name, .row-url').evaluateAll((texts) => texts.map((text) => text.scrollWidth > text.clientWidth));
  expect(cut).toEqual([true, true, true, true]);
  await checkFitAndAccessibility(popup);
});

// An empty document shows the first run instead (G30).
test('a document without a mapping line, with nothing typed, lists no row: no cue, and Enter does nothing', async ({ extension, site }) => {
  for (const stored of [{ mappings: '\\ notes\n' }, { mappings: '\n\\ notes\nnot a mapping\n' }]) {
    await extension.seedStorage(stored);
    const { popup } = await popupOnNewPage(extension, site);
    await expect(footer(popup)).toHaveText('No mappings to list · Enter does nothing');
    await expect(popup.getByRole('option')).toHaveCount(0);
    await expect(cue(popup)).toHaveCount(0);
    const tabs = await pageTabs(extension);
    await popup.keyboard.press('Enter');
    await popup.waitForTimeout(300);
    expect(await pageTabs(extension)).toEqual(tabs);
    expect(await extension.openPopups()).toBe(1);
    await checkFitAndAccessibility(popup);
    await popup.close();
  }
});

test('text that matches no mapping lists only the Name row, selected: no cue, and Enter opens nothing but the Name form', async ({ extension, site }) => {
  for (const [stored, typed] of [
    [{ mappings: 'mail  https://mail.example.com/\n' }, 'zzz'],
    [{ mappings: '\\ notes\nnot a mapping\n' }, 'mail'],
  ] as const) {
    await extension.seedStorage(stored);
    const { popup } = await popupOnNewPage(extension, site);
    await popup.keyboard.type(typed);
    await expect(footer(popup)).toHaveText('Enter opens the Name form');
    await expect(popup.getByRole('option')).toHaveCount(1);
    await expect(selected(popup)).toHaveAccessibleName(`Name "${typed}" for this page`);
    await expect(cue(popup)).toHaveCount(0);
    await checkFitAndAccessibility(popup);
    const tabs = await pageTabs(extension);
    await popup.keyboard.press('Enter');
    await expect(popup.getByRole('textbox', { name: 'Name' })).toHaveValue(typed);
    await popup.waitForTimeout(300);
    expect(await pageTabs(extension)).toEqual(tabs);
    expect(await extension.openPopups()).toBe(1);
    expect((await extension.readStorage()).mappings).toBe(stored.mappings);
    await popup.close();
  }
});

test('the list redraws when the document, the usage, or the order changes while the popup is open', async ({ extension, site }) => {
  const doc = 'avocado  https://avocado.example/\nbanana  https://banana.example/\napple  https://apple.example/\n';
  await extension.seedStorage({ mappings: doc });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('a');
  await expect.poll(() => names(popup)).toEqual(['avocado', 'apple', 'banana']);
  await extension.seedStorage({ mappings: `${doc}apricot  https://apricot.example/\n` });
  await expect.poll(() => names(popup)).toEqual(['avocado', 'apple', 'apricot', 'banana']);
  await expect(selected(popup).locator('.row-name')).toHaveText('avocado');

  // Under Smart order with a blank box, a use stored for banana lists it first, and selects nothing.
  await popup.keyboard.press('Control+a');
  await popup.keyboard.press('Backspace');
  await extension.seedStorage({ mappings: doc, searchOrder: 'smart' });
  await expect.poll(() => names(popup)).toEqual(['avocado', 'banana', 'apple']);
  await expect(selected(popup)).toHaveCount(0);
  await extension.seedStorage({ mappings: doc, searchOrder: 'smart', usage: { 'banana\nhttps://banana.example/': [Date.now()] } });
  await expect.poll(() => names(popup)).toEqual(['banana', 'avocado', 'apple']);
  await expect(selected(popup)).toHaveCount(0);
  // The order preference removed: Document order, line order.
  await extension.seedStorage({ mappings: doc, usage: { 'banana\nhttps://banana.example/': [Date.now()] } });
  await expect.poll(() => names(popup)).toEqual(['avocado', 'banana', 'apple']);
  await expect(selected(popup)).toHaveCount(0);
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
});

test('the theme follows themePref, and the system when it is absent, also while the popup is open', async ({ extension, site }) => {
  const doc = 'mail  https://mail.example.com/\n';
  await extension.seedStorage({ mappings: doc, themePref: 'dark' });
  const { popup } = await popupOnNewPage(extension, site);
  await expect.poll(() => shownTheme(popup)).toBe('dark');
  await popup.emulateMedia({ colorScheme: 'light' });
  expect(await shownTheme(popup)).toBe('dark');

  await extension.seedStorage({ mappings: doc, themePref: 'light' });
  await popup.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => shownTheme(popup)).toBe('light');

  await extension.seedStorage({ mappings: doc });
  await expect.poll(() => shownTheme(popup)).toBe('dark');
  await popup.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => shownTheme(popup)).toBe('light');
  await popup.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => shownTheme(popup)).toBe('dark');
  // Nothing in the popup writes a preference.
  expect(await extension.readStorage()).toEqual({ mappings: doc });
});

test("after an update from 1.x the popup is dark and in Document order, and lists 1.x's mappings as G23 says", async ({ extension, site }) => {
  const oneX = {
    mappings:
      '\\ Work\r\n' +
      'mailbox              https://mailbox.example.com/\r\n' +
      'mail                 https://mail.example.com/\r\n' +
      'docs\thttps://docs.example.com/          \\ team docs\r\n' +
      '\r\n' +
      'not a mapping\r\n' +
      'MAIL                 https://other.example.com/\r\n',
    themePref: 'dark',
    usage: { 'docs\nhttps://docs.example.com/': [Date.now()] },
  };
  await extension.seedStorage(oneX);
  await extension.dispatchEvent('runtime.onInstalled', { reason: 'update', previousVersion: '1.3.0' });
  await expect.poll(() => extension.readStorage()).toEqual({ ...oneX, upgradeNotice: 'pending' });

  const { popup } = await popupOnNewPage(extension, site);
  await expect.poll(() => shownTheme(popup)).toBe('dark');
  // Document order: the used mapping keeps its line.
  await expect.poll(() => names(popup)).toEqual(['mailbox', 'mail', 'docs']);
  await expect(upgradeNotice(popup).notice).toBeVisible();
  await popup.keyboard.type('ma');
  await expect.poll(() => names(popup)).toEqual(['mailbox', 'mail']);
  await popup.keyboard.type('il');
  await expect.poll(() => names(popup)).toEqual(['mail', 'mailbox']);
  await popup.keyboard.type(' ');
  await expect.poll(() => names(popup)).toEqual(['mail', 'mailbox']);
  // Unreadable lines are never listed: what only they hold finds the Name row alone.
  for (const typed of ['not', 'other']) {
    await popup.getByRole('combobox').fill(typed);
    await expect(popup.getByRole('option')).toHaveCount(1);
    await expect(selected(popup)).toHaveAccessibleName(`Name "${typed}" for this page`);
  }
  // Everything 1.x stored is as it was; the first key typed dismissed the notice of what is new (G25).
  await expect.poll(() => extension.readStorage()).toEqual(oneX);
});

test('focus on the chip makes the footer say Enter flips it, and Enter does', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.keyboard.type('mail');
  await popup.keyboard.press('Tab');
  const chip = popup.getByRole('button', { name: /^New tab mode/ });
  await expect(chip).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter or Space switches to This tab');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('button', { name: /^This tab mode/ })).toHaveText('This tab');
  await expect(footer(popup)).toHaveText('Enter or Space switches to New tab');
  await popup.keyboard.press('Shift+Tab');
  await expect(footer(popup)).toHaveText('Enter opens it in this tab · Shift+Enter in a new tab');
});

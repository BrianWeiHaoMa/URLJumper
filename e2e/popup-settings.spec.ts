// The popup's settings (G31; Composition, "Popup"): the gear in search and in the first-run state opens them
// on a focused control, the way back returns to where they were opened, and *Open in tab* opens the options
// page; the footer says what Enter does wherever the focus is (L2), Enter on a choice does nothing, Escape
// closes the popup, and every state fits (G7) and passes the accessibility pass (G32).
import type { Page } from '@playwright/test';
import { checkFit, checkFitAndAccessibility, closingPopup, expect, focusDrawn, popupOnNewPage, test } from './extension.ts';

const DOC = 'mail  https://mail.example.com/\ncal  https://cal.example.com/\n';

const footer = (popup: Page) => popup.locator('footer');
const gear = (popup: Page) => popup.getByRole('button', { name: 'Settings' });
const back = (popup: Page) => popup.getByRole('button', { name: 'Back' });
const openInTab = (popup: Page) => popup.getByRole('button', { name: 'Open in tab' });
const viewButton = (popup: Page) => popup.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Preferences' });
const order = (popup: Page) => popup.getByRole('listbox', { name: 'Search order' });
const theme = (popup: Page) => popup.getByRole('listbox', { name: 'Theme' });
const reset = (popup: Page) => popup.getByRole('button', { name: 'Reset learned order' });
const changeShortcuts = (popup: Page) => popup.getByRole('button', { name: 'Change shortcuts in Chrome' });
const searchBox = (popup: Page) => popup.getByRole('combobox');
const firstRun = (popup: Page) => popup.getByRole('heading', { name: 'No mappings yet' });

/** Presses `key` until `control` has the focus, at most `times` times; whether the view itself takes a stop depends on whether it scrolls. */
async function pressUntilFocused(popup: Page, key: string, control: ReturnType<typeof back>, times = 6) {
  for (let i = 0; i < times && !(await control.evaluate((element) => element === document.activeElement)); i++) await popup.keyboard.press(key);
  await expect(control).toBeFocused();
}

/** Whether the control with the focus is drawn whole inside the view's visible box. */
const focusedInView = (popup: Page) =>
  popup.evaluate(() => {
    const [box, view] = [document.activeElement!.getBoundingClientRect(), document.querySelector('.view')!.getBoundingClientRect()];
    return box.top >= view.top && box.bottom <= view.bottom;
  });

test('from search the keyboard reaches the gear and opens settings on a control, reaches every control with the footer true for each, and goes back to search', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await expect(searchBox(popup)).toBeFocused();
  // A row is selected, and Enter on the gear opens settings, never the row.
  await popup.keyboard.type('ma');
  await expect(popup.locator('[role=option][aria-selected=true] .row-name')).toHaveText('mail');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await expect(gear(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens settings');
  const tabs = await extension.tabUrls();

  await popup.keyboard.press('Enter');
  await expect(order(popup)).toBeFocused();
  expect(await extension.tabUrls()).toEqual(tabs);
  await expect(footer(popup)).toHaveText('The arrow keys choose · Enter does nothing');
  await expect(searchBox(popup)).toHaveCount(0);
  await checkFitAndAccessibility(popup);

  const along: [() => ReturnType<typeof order>, string][] = [
    [() => reset(popup), 'Enter removes the learned order'],
    [() => theme(popup), 'The arrow keys choose · Enter does nothing'],
    [() => changeShortcuts(popup), "Enter opens Chrome's shortcuts page"],
  ];
  for (const [control, says] of along) {
    await popup.keyboard.press('Tab');
    await expect(control()).toBeFocused();
    await expect(footer(popup)).toHaveText(says);
  }
  // Round the end to the header.
  const header: [() => ReturnType<typeof order>, string][] = [
    [() => back(popup), 'Enter leaves settings'],
    [() => viewButton(popup), 'Enter does nothing · Preferences is shown'],
    [() => openInTab(popup), 'Enter opens settings in a tab'],
  ];
  for (const [control, says] of header) {
    await popup.keyboard.press('Tab');
    await expect(control()).toBeFocused();
    await expect(footer(popup)).toHaveText(says);
  }
  await expect(viewButton(popup)).toHaveAttribute('aria-current', 'page');

  // Enter on the shown view's own button leaves it shown, and with no control focused Enter does nothing.
  await viewButton(popup).focus();
  await popup.keyboard.press('Enter');
  await expect(order(popup)).toBeVisible();
  await popup.getByRole('heading', { name: 'Theme' }).click();
  expect(await popup.evaluate(() => document.activeElement === document.body || document.activeElement!.className === 'view')).toBe(true);
  await expect(footer(popup)).toHaveText('Enter does nothing');
  const stored = await extension.readStorage();
  await popup.keyboard.press('Enter');
  await expect(order(popup)).toBeVisible();
  expect(await extension.readStorage()).toEqual(stored);

  // The full page's Export and Import are not offered here.
  await expect(popup.getByRole('button', { name: /Export|Import/ })).toHaveCount(0);

  // Back to search as it was left, the typing and its list with it.
  await back(popup).focus();
  await popup.keyboard.press('Enter');
  await expect(searchBox(popup)).toBeFocused();
  await expect(searchBox(popup)).toHaveValue('ma');
  await expect(popup.locator('[role=option][aria-selected=true] .row-name')).toHaveText('mail');
  await expect(footer(popup)).toHaveText('Enter opens it in a new tab · Shift+Enter in this tab');
  expect(await extension.tabUrls()).toEqual(tabs);
  expect('usage' in (await extension.readStorage())).toBe(false);
  await checkFitAndAccessibility(popup);
});

test('Enter on a choice stores nothing and leaves settings as they were; Escape closes the popup from settings', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await gear(popup).click();
  await expect(order(popup)).toBeFocused();
  const stored = await extension.readStorage();
  const changes = await extension.watchStorage();
  for (const choice of [order(popup), theme(popup)]) {
    await choice.focus();
    await popup.keyboard.press('Enter');
    await expect(choice).toBeFocused();
    await expect(footer(popup)).toHaveText('The arrow keys choose · Enter does nothing');
  }
  await expect(order(popup).getByRole('option', { selected: true })).toHaveText('Document order');
  await expect(theme(popup).getByRole('option', { selected: true })).toHaveText('System');
  await checkFitAndAccessibility(popup);
  await popup.waitForTimeout(300);
  expect(await changes()).toEqual([]);
  expect(await extension.readStorage()).toEqual(stored);

  await closingPopup(popup, () => popup.keyboard.press('Escape'));
});

test('after a pointer click on the gear or on Back, the control the popup focuses is drawn focused, in search and in the first run', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await gear(popup).click();
  await expect(order(popup)).toBeFocused();
  // Compared once the stored order is shown, so only the focus can tell the two pictures apart.
  await expect(order(popup).getByRole('option', { selected: true })).toHaveText('Document order');
  expect(await focusDrawn(popup)).toBe(true);

  // The document emptied meanwhile, the way back by pointer lands on the first run's *Name this page*.
  await extension.seedStorage({});
  await back(popup).click();
  await expect(firstRun(popup)).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();
  expect(await focusDrawn(popup)).toBe(true);

  await gear(popup).click();
  await expect(order(popup)).toBeFocused();
  await expect(order(popup).getByRole('option', { selected: true })).toHaveText('Document order');
  expect(await focusDrawn(popup)).toBe(true);
});

test('with an empty document the first Enter still opens the Name form; the gear before it opens settings, whose way back returns to the first run', async ({ extension, site }) => {
  await extension.seedStorage({});
  const { popup } = await popupOnNewPage(extension, site);
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens the Name form');
  await popup.keyboard.press('Shift+Tab');
  await expect(gear(popup)).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter opens settings');
  await popup.keyboard.press('Enter');
  await expect(order(popup)).toBeFocused();
  await checkFitAndAccessibility(popup);

  await pressUntilFocused(popup, 'Shift+Tab', back(popup));
  await popup.keyboard.press('Enter');
  await expect(firstRun(popup)).toBeVisible();
  await expect(popup.getByRole('button', { name: 'Name this page' })).toBeFocused();
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('textbox', { name: 'Name' })).toBeFocused();
});

test('opening settings ends a confirmation and its Undo: back in search none is offered, and the chip keeps the mode chosen for this popup', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.locator('.chip').click();
  await expect(popup.locator('.chip')).toHaveText('This tab');
  await popup.getByRole('button', { name: 'Name this page' }).click();
  await popup.keyboard.type('stocks');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Saved "stocks" as line 3');
  await expect(popup.getByRole('button', { name: 'Undo saving "stocks"' })).toBeVisible();
  const saved = await extension.readStorage();

  await gear(popup).click();
  await expect(order(popup)).toBeFocused();
  await back(popup).click();
  await expect(searchBox(popup)).toBeFocused();
  await expect(popup.locator('.confirmation')).toHaveCount(0);
  await expect(popup.getByRole('button', { name: /^Undo/ })).toHaveCount(0);
  await expect(popup.locator('.chip')).toHaveText('This tab');
  await expect(popup.locator('[role=option] .row-name')).toHaveText(['mail', 'cal', 'stocks']);
  expect(await extension.readStorage()).toEqual(saved);
});

test('Open in tab opens the options page in a tab on the view shown, and the popup closes', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await gear(popup).click();
  await openInTab(popup).focus();
  await expect(footer(popup)).toHaveText('Enter opens settings in a tab');
  const opened = extension.context.waitForEvent('page', { predicate: (page) => page.url().startsWith(extension.url('options.html')) });
  await closingPopup(popup, () => popup.keyboard.press('Enter'));
  const options = await opened;
  await expect.poll(() => extension.tabUrls()).toContain(extension.url('options.html#view=preferences'));
  await expect(options.getByRole('listbox', { name: 'Search order' })).toBeVisible();
  await expect(options.getByRole('button', { name: 'Export…' })).toBeVisible();
  await expect(options.getByRole('button', { name: /Open in tab|Back/ })).toHaveCount(0);
});

test('settings taller than the popup scroll between the header and the footer, which stay in view, and the view takes the focus to scroll', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await gear(popup).click();
  await expect(order(popup)).toBeFocused();
  await checkFitAndAccessibility(popup);
  // Content taller than the viewport Chrome allows, as at a larger zoom.
  await popup.evaluate(() => {
    const tall = document.createElement('div');
    tall.style.height = '700px';
    document.querySelector('.view-content')!.append(tall);
  });
  await expect.poll(() => popup.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const inView = (selector: string) =>
    popup.evaluate((selector) => {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight;
    }, selector);
  expect(await inView('main > header')).toBe(true);
  expect(await inView('main > footer')).toBe(true);
  expect(await popup.evaluate(() => document.querySelector('.view')!.scrollHeight > document.querySelector('.view')!.clientHeight)).toBe(true);
  await checkFit(popup);

  await openInTab(popup).focus();
  await popup.keyboard.press('Tab');
  expect(await popup.evaluate(() => document.activeElement?.className)).toBe('view');
  await expect(footer(popup)).toHaveText('Enter does nothing');
  await popup.keyboard.press('Tab');
  await expect(order(popup)).toBeFocused();
});

test('in settings that scroll, each control the focus moves to stays in sight as the footer is redrawn for it', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await gear(popup).click();
  await expect(order(popup)).toBeFocused();
  // Content a little taller than the popup Chrome gives here, and within the 600 pixels it allows (S6): drawn
  // at its own height to be measured, the view no longer scrolls, which must not leave it scrolled to the top.
  expect(await popup.evaluate(() => innerHeight)).toBeLessThan(560);
  await popup.evaluate(() => {
    const height = (selector: string) => document.querySelector<HTMLElement>(selector)!.offsetHeight;
    const own = height('main > header') + height('.view-content') + height('main > footer');
    const tall = document.createElement('div');
    tall.style.height = `${Math.max(0, innerHeight + 40 - own)}px`;
    document.querySelector('.view-content')!.prepend(tall);
  });
  await expect.poll(() => popup.evaluate(() => document.querySelector('.view')!.scrollHeight > document.querySelector('.view')!.clientHeight)).toBe(true);
  await checkFit(popup);

  // From the header, past the view's own stop.
  await openInTab(popup).focus();
  for (const [control, says] of [
    [order(popup), 'The arrow keys choose · Enter does nothing'],
    [reset(popup), 'Enter removes the learned order'],
    [theme(popup), 'The arrow keys choose · Enter does nothing'],
    [changeShortcuts(popup), "Enter opens Chrome's shortcuts page"],
  ] as const) {
    await pressUntilFocused(popup, 'Tab', control, 2);
    await expect(footer(popup)).toHaveText(says);
    expect(await focusedInView(popup)).toBe(true);
  }
});

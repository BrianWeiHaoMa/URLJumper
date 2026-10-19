// The Text view by keyboard alone in each host (G7, G32, L2): Tab reaches the view, the text area, Save, *Copy
// tab URL*, and each error; Enter on an error puts the caret on its line with the text area in view; the
// popup's footer says what Enter does at each, and the focus is never left on nothing. A list of errors longer
// than the popup scrolls its view, with the header and footer in view.
import type { Page } from '@playwright/test';
import { caret, checkAccessibilityInBothSchemes, checkFit, checkFitAndAccessibility, expect, popupOnNewPage, test, textView } from './extension.ts';

const DOC = 'mail  https://mail.example/\ncal  https://cal.example/\n';

const footer = (popup: Page) => popup.locator('footer');
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name, exact: true });
const focusOnNothing = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

test('in the popup, the keyboard alone reaches the Text view and each of its controls, with the footer true at each', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  const view = textView(popup);
  // Settings open once the popup has read the document and found its tab.
  await expect(footer(popup)).toHaveText('Enter does nothing · Down selects a row');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: 'Settings' })).toBeFocused();
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('listbox', { name: 'Search order' })).toBeFocused();
  // Back past *Open in tab* to the view's button, one stop each. Preferences is whole once its shortcuts are
  // shown, and its view then takes a stop of its own, before its first control, exactly when it scrolls.
  await expect(popup.locator('.shortcut')).toHaveCount(3);
  if (await popup.locator('.view').evaluate((view) => view.scrollHeight > view.clientHeight)) {
    await popup.keyboard.press('Shift+Tab');
    await expect(popup.locator('.view')).toBeFocused();
  }
  await popup.keyboard.press('Shift+Tab');
  await expect(popup.getByRole('button', { name: 'Open in tab' })).toBeFocused();
  await popup.keyboard.press('Shift+Tab');
  await expect(nav(popup, 'Text')).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter shows Text');
  await popup.keyboard.press('Enter');
  await expect(view.area).toBeFocused();
  await expect(view.area).toBeEditable();
  await expect(footer(popup)).toHaveText('Enter starts a new line');

  await popup.keyboard.press('Control+End');
  await popup.keyboard.type('just-a-name');
  await popup.keyboard.press('Tab');
  await expect(view.save).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter saves the text');
  await popup.keyboard.press('Enter');
  await expect(view.status).toHaveText('Not saved');
  await expect(view.errors).toHaveText(['Line 3: expected a name and a URL']);
  await expect(view.save).toBeFocused();
  await popup.keyboard.press('Tab');
  await expect(view.copyTabUrl).toBeFocused();
  await expect(footer(popup)).toHaveText("Enter copies the tab's address");
  await popup.keyboard.press('Tab');
  await expect(view.errors.first()).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter moves the caret to line 3');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Enter');
  expect(await caret(view.area)).toEqual({ focused: true, line: 3, atLineStart: true, inView: true });
  await expect(footer(popup)).toHaveText('Enter starts a new line');
  await expect(view.area).toHaveValue(`${DOC}just-a-name`);
  expect(await focusOnNothing(popup)).toBe(false);
  expect((await extension.readStorage()).mappings).toBe(DOC);
});

test('a list of errors longer than the popup scrolls its view; activating the last puts the caret on its line with the text area in view', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  await popup.getByRole('button', { name: 'Settings' }).click();
  await nav(popup, 'Text').click();
  const view = textView(popup);
  await expect(view.area).toBeEditable();
  const draft = `${DOC}${Array.from({ length: 12 }, (_, i) => `broken-${i + 1}`).join('\n')}\n`;
  await view.area.fill(draft);
  await view.save.click();
  await expect(view.errors).toHaveCount(12);
  await expect(view.errors.last()).toHaveText('Line 14: expected a name and a URL');
  expect(await popup.evaluate(() => {
    const scroller = document.querySelector('.view')!;
    return scroller.scrollHeight > scroller.clientHeight;
  })).toBe(true);
  // Text partly scrolled out of the view is where axe cannot judge contrast: the pass runs with the view at its top.
  await popup.locator('.view').evaluate((scroller) => (scroller.scrollTop = 0));
  await checkFitAndAccessibility(popup);

  await view.errors.last().focus();
  await expect(view.errors.last()).toBeInViewport({ ratio: 1 });
  await expect(footer(popup)).toHaveText('Enter moves the caret to line 14');
  await popup.keyboard.press('Enter');
  expect(await caret(view.area)).toEqual({ focused: true, line: 14, atLineStart: true, inView: true });
  await expect(view.area).toBeInViewport({ ratio: 1 });
  await expect(view.area).toHaveValue(draft);
  await checkFit(popup);
  // The hint above the text area is now scrolled out under the header, where axe cannot judge its contrast:
  // the accessibility pass runs on this state with the view back at its top, as above.
  await popup.locator('.view').evaluate((scroller) => (scroller.scrollTop = 0));
  await checkFitAndAccessibility(popup);
  expect(await caret(view.area)).toEqual({ focused: true, line: 14, atLineStart: true, inView: true });
});

test('on the options page, the keyboard alone reaches the Text view, the text area, Save, and each error, and the focus is never left on nothing', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const page = await extension.context.newPage();
  await page.goto(extension.url('options.html'));
  const view = textView(page);
  await expect(page.getByRole('listbox', { name: 'Search order' })).toBeVisible();
  // From the page's start, one stop each: the list of views, Preferences then Text.
  await page.keyboard.press('Tab');
  await expect(nav(page, 'Preferences')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(nav(page, 'Text')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(view.area).toBeEditable();
  await expect(nav(page, 'Text')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(view.area).toBeFocused();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('just-a-name\nsecond-name');
  await page.keyboard.press('Tab');
  await expect(view.save).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(view.errors).toHaveText(['Line 3: expected a name and a URL', 'Line 4: expected a name and a URL']);
  await expect(view.copyTabUrl).toHaveCount(0);
  for (const [index, line] of [[0, 3], [1, 4]] as const) {
    await view.save.focus();
    for (let i = 0; i <= index; i++) await page.keyboard.press('Tab');
    await expect(view.errors.nth(index)).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await caret(view.area)).toEqual({ focused: true, line, atLineStart: true, inView: true });
  }
  expect(await focusOnNothing(page)).toBe(false);
  await checkAccessibilityInBothSchemes(page);
});

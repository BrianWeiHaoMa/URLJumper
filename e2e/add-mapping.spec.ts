// *Add mapping* in the List view, in both settings hosts (In use, "Edit the list"; G8, G9, G11, G12, G13, G15,
// G21, G32, N6, L2, R1): the control after the last line opens the Name form in its place with no page, an
// empty URL field, and the name field empty with the focus; Save inserts one line after the document's last
// line that holds text, or at the end when the chosen heading is gone, confirmed by name and line beside the new
// row with Undo, itself undoable, the focus on the new row's pencil; a taken name blocks Save and *Edit
// instead* opens that line's editor where the line now stands; a store Chrome refuses keeps the values; while
// Save awaits its reply every other edit and Cancel wait; one form or editor is open at a time; Cancel gives the
// focus back to the control; and every state fits the popup and passes the accessibility pass (G7, G32).
import type { Page } from '@playwright/test';
import {
  checkFit,
  checkFitAndAccessibility,
  expect,
  holdPageRequests,
  lineConfirmation,
  listViewIn,
  listViewInPopup,
  nameForm,
  recordWorkerCalls,
  refuseWorkerStorage,
  rowEditor,
  SETTINGS_HOSTS,
  test,
  type LoadedExtension,
  type LocalSite,
  type SettingsHost,
} from './extension.ts';

const footer = (page: Page) => page.locator('footer');

/** A line as the extension writes it near lines whose URL starts at column 22 (F12). */
const lineOf = (name: string, url: string) => `${name.padEnd(21)}${url}`;

const DOC = ['\\ Daily', lineOf('mail', 'https://mail.example/'), lineOf('cal', 'https://cal.example/'), '', 'just-a-name', lineOf('last', 'https://l.example/'), ''].join('\n');

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

/**
 * The List view in `host` on `mappings`: in the popup opened by the toolbar button on the page at `opener`,
 * whose address Chrome grants it (E5) and whose search says what that page is called (G10); else on the
 * options page.
 */
async function listOpenedOn(host: SettingsHost, extension: LoadedExtension, site: LocalSite, mappings: string, opener: string) {
  if (host === 'options page') return listViewIn(host, extension, site, { mappings });
  await extension.seedStorage({ mappings });
  const tab = await extension.context.newPage();
  await tab.goto(opener);
  const popup = await extension.clickToolbarButton(tab);
  await expect(popup.locator('.this-page')).toBeVisible();
  return { page: popup, view: await listViewInPopup(popup), check: () => checkFitAndAccessibility(popup) };
}

for (const host of SETTINGS_HOSTS) {
  const says = (page: Page, text: string) => (host === 'popup' ? expect(footer(page)).toHaveText(text) : expect(footer(page)).toHaveCount(0));

  test(`in the ${host}, Add mapping opens the Name form in its place with no page, the name empty and focused; Save inserts one line after the last, confirmed beside it with Undo, whose own Undo works`, async ({ extension, site }) => {
    const opener = site.pageUrl('A page with a mapping');
    const doc = `${DOC}${lineOf('here', opener)}\n`;
    const { page, view, check } = await listOpenedOn(host, extension, site, doc, opener);
    await view.addMapping.click();
    const form = nameForm(page);
    await expect(form.name).toBeFocused();
    await expect(form.name).toHaveValue('');
    await expect(form.url).toHaveValue('');
    // No page: no line about a tab, a title, a host, or an address, and no *This page is*, even for the
    // popup's tab, whose address has a mapping (G11, N6).
    await expect(form.subject).toHaveCount(0);
    await expect(form.thisPage).toHaveCount(0);
    for (const text of [opener, new URL(opener).host, 'A page with a mapping', 'Chrome gave no address']) await expect(form.form).not.toContainText(text);
    // In the control's place, after the last line.
    await expect(view.addMapping).toHaveCount(0);
    const list = (await view.list.boundingBox())!;
    expect((await form.form.boundingBox())!.y).toBeGreaterThanOrEqual(list.y + list.height);
    await expect(form.where).toHaveText('Line 8, at the end of the document');
    await says(page, 'Enter does nothing · Line 8 needs a name.');
    await check();

    await form.name.fill('new one');
    await form.url.fill('https://example.com/a');
    const line = lineOf('new one', 'https://example.com/a');
    await expect(form.previewLine).toHaveText(line);
    await says(page, 'Enter saves it as line 8');
    const calls = await recordWorkerCalls(extension.worker);
    await page.keyboard.press('Enter');
    const confirmation = lineConfirmation(page);
    await expect(confirmation.text).toHaveText('Saved "new one" as line 8');
    const saved = `${doc}${line}\n`;
    expect(await storedDocument(extension)).toBe(saved);
    // One write, holding the document and its usage together (R1).
    expect((await calls()).filter(([method]) => method === 'storage.set').map(([, items]) => Object.keys(items as object).sort())).toEqual([['mappings', 'usage']]);
    await expect(form.form).toHaveCount(0);
    await expect(view.pencil('new one')).toBeFocused();
    await says(page, 'Enter edits line 8');
    // Beside the new row, its Undo in view; the control back after the list.
    await expect(view.list.locator('.list-row:has(+ .list-confirmation) .list-number')).toHaveText('8');
    await expect(confirmation.undo).toBeInViewport();
    await expect(view.addMapping).toBeVisible();
    await check();

    await confirmation.undo.click();
    await expect(confirmation.text).toHaveText('Removed "new one" from line 8');
    expect(await storedDocument(extension)).toBe(doc);
    await confirmation.undo.click();
    await expect(confirmation.text).toHaveText('Put "new one" back as line 8');
    expect(await storedDocument(extension)).toBe(saved);
    // The view is not left waiting: Enter on the new row's pencil opens its editor.
    await view.pencil('new one').focus();
    await page.keyboard.press('Enter');
    await expect(rowEditor(page).note).toBeVisible();
    await expect(rowEditor(page).name).toHaveValue('new one');
  });

  test(`in the ${host}, by keyboard alone: Tab from the last pencil reaches Add mapping, whose Enter opens the form and ends the confirmation shown; Cancel stores nothing and gives the focus back`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.pencil('cal').click();
    await rowEditor(page).delete.click();
    const confirmation = lineConfirmation(page);
    await expect(confirmation.text).toHaveText('Removed "cal" from line 3');
    const removed = DOC.replace(`${lineOf('cal', 'https://cal.example/')}\n`, '');
    await view.pencil('last').focus();
    await page.keyboard.press('Tab');
    await expect(view.addMapping).toBeFocused();
    await says(page, 'Enter opens the Name form for a new mapping');
    await expect(confirmation.text).toHaveText('Removed "cal" from line 3');
    await page.keyboard.press('Enter');
    const form = nameForm(page);
    await expect(form.name).toBeFocused();
    await expect(confirmation.text).toHaveCount(0);
    await page.keyboard.type('typed');
    await form.cancel.focus();
    // Not search: Cancel returns to the list (L2).
    await says(page, 'Enter returns to the list');
    await page.keyboard.press('Enter');
    await expect(form.form).toHaveCount(0);
    await expect(view.addMapping).toBeFocused();
    await says(page, 'Enter opens the Name form for a new mapping');
    expect(await storedDocument(extension)).toBe(removed);
    await check();
    // Opened again, it is a fresh form.
    await page.keyboard.press('Enter');
    await expect(form.name).toHaveValue('');
  });

  test(`in the ${host}, an empty document says it has no mappings and offers Add mapping alone; its Save stores the one line, listed as line 1`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: '' });
    await expect(view.empty).toBeVisible();
    await expect(page.locator('.list-view').getByRole('button')).toHaveText(['Add mapping']);
    await check();
    await view.addMapping.click();
    const form = nameForm(page);
    await expect(form.where).toHaveText('Line 1, at the end of the document');
    await expect(form.sections).toHaveCount(0);
    await form.name.fill('solo');
    await form.url.fill('https://solo.example/');
    await form.save.click();
    await expect(lineConfirmation(page).text).toHaveText('Saved "solo" as line 1');
    // At the start of the document (G9), before its one line, empty, which stays as it was (G12).
    expect(await storedDocument(extension)).toBe(`${lineOf('solo', 'https://solo.example/')}\n`);
    await expect(view.numbers).toHaveText(['1']);
    await expect(view.empty).toHaveCount(0);
    await expect(view.pencil('solo')).toBeFocused();
    await check();
  });

  test(`in the ${host}, the Section choice follows the view's read: a heading another page adds is offered, and one it removes after being chosen sends the line to the end, as the confirmation says`, async ({ extension, site }) => {
    const search = lineOf('g', 'https://www.google.com/search?q=%s');
    const doc = ['\\ Daily', lineOf('mail', 'https://mail.example/'), '', '\\ Search', search, ''].join('\n');
    const { page, view } = await listViewIn(host, extension, site, { mappings: doc });
    await view.addMapping.click();
    const form = nameForm(page);
    await expect(form.sections.getByRole('option')).toHaveText(['End of document', 'Daily', 'Search']);
    await extension.seedStorage({ mappings: `${doc}\\ Later\n` });
    await expect(form.sections.getByRole('option')).toHaveText(['End of document', 'Daily', 'Search', 'Later']);
    await form.section('Daily').click();
    await expect(form.where).toHaveText('Line 3, at the end of the section "Daily"');
    await form.name.fill('news');
    await form.url.fill('https://news.example/');
    const withoutDaily = `${doc.replace('\\ Daily\n', '')}\\ Later\n`;
    await extension.seedStorage({ mappings: withoutDaily });
    await expect(form.where).toHaveText('Line 6, at the end of the document: the heading you chose is no longer there');
    await form.save.click();
    await expect(lineConfirmation(page).text).toHaveText('Saved "news" as line 6, at the end of the document: the heading you chose was not found');
    expect(await storedDocument(extension)).toBe(`${withoutDaily}${lineOf('news', 'https://news.example/')}\n`);
  });

  test(`in the ${host}, a taken name blocks Save and keeps the values; Edit instead opens that line's editor where another page's insert above has moved it`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.addMapping.click();
    const form = nameForm(page);
    await form.name.fill('MAIL');
    await form.url.fill('https://mine.example/');
    await expect(form.problem).toHaveText('Line 2 already has the name "mail".');
    await expect(form.save).toHaveAttribute('aria-disabled', 'true');
    await says(page, 'Enter does nothing · Line 2 already has this name.');
    // Pressed though it is blocked, as Playwright would not.
    await form.save.click({ force: true });
    await page.keyboard.press('Enter');
    await expect(form.name).toHaveValue('MAIL');
    await expect(form.url).toHaveValue('https://mine.example/');
    expect(await storedDocument(extension)).toBe(DOC);
    await check();

    // Another page adds a line above it: the offer follows the line to its new number (G13).
    const moved = `\\ above\n${DOC}`;
    await extension.seedStorage({ mappings: moved });
    await expect(form.problem).toHaveText('Line 3 already has the name "mail".');
    await expect(form.editInstead).toHaveText('Edit "mail" instead');
    await form.editInstead.click();
    await expect(form.form).toHaveCount(0);
    const editor = rowEditor(page);
    await expect(editor.name).toBeFocused();
    await expect(editor.name).toHaveValue('mail');
    await says(page, 'Enter saves line 3');
    await editor.url.fill('https://mail.example/new');
    await editor.save.click();
    await expect(lineConfirmation(page).text).toHaveText('Changed "mail" on line 3');
    expect(await storedDocument(extension)).toBe(moved.replace('https://mail.example/', 'https://mail.example/new'));
  });

  test(`in the ${host}, a store Chrome refuses says so in the form and keeps the values; nothing is stored and the view's edits act again`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.addMapping.click();
    const form = nameForm(page);
    await form.name.fill('kept');
    await form.url.fill('https://kept.example/');
    await refuseWorkerStorage(extension.worker, 'set', 'Quota exceeded');
    await form.save.click();
    await expect(form.problem).toHaveText('Not saved. Chrome said: Quota exceeded');
    await expect(form.name).toHaveValue('kept');
    await expect(form.url).toHaveValue('https://kept.example/');
    await expect(lineConfirmation(page).text).toHaveCount(0);
    expect(await storedDocument(extension)).toBe(DOC);
    for (const control of [view.pencil('mail'), view.fixInText, form.cancel]) await expect(control).toHaveAttribute('aria-disabled', 'false');
    await check();
  });

  test(`in the ${host}, while Save awaits its reply every pencil, Fix in text, and Cancel wait, the footer saying so; the reply then confirms the line and they act again`, async ({ extension, site }) => {
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    const held = await holdPageRequests(page, 'insert');
    await view.addMapping.click();
    const form = nameForm(page);
    await form.name.fill('pending');
    await form.url.fill('https://pending.example/');
    await form.save.click();
    await expect.poll(held.held).toBe(1);
    await says(page, 'Saving · Enter does nothing until it is stored');
    for (const control of [view.pencil('mail'), view.pencil('last'), view.fixInText, form.cancel]) await expect(control).toHaveAttribute('aria-disabled', 'true');
    // Pressed though they wait, as Playwright would not.
    await form.cancel.click({ force: true });
    await form.cancel.focus();
    await says(page, 'Saving · Enter does nothing until it is stored');
    await page.keyboard.press('Enter');
    await view.pencil('cal').focus();
    await says(page, 'Enter does nothing until the change is stored');
    await page.keyboard.press('Enter');
    await view.fixInText.click({ force: true });
    await expect(form.name).toHaveValue('pending');
    await expect(rowEditor(page).note).toHaveCount(0);
    await expect(view.fixInText).toBeVisible();
    await check();
    await held.release();
    await expect(lineConfirmation(page).text).toHaveText('Saved "pending" as line 7');
    await expect(form.form).toHaveCount(0);
    for (const control of [view.pencil('mail'), view.pencil('pending'), view.fixInText, view.addMapping]) await expect(control).toHaveAttribute('aria-disabled', 'false');
    await view.pencil('cal').click();
    await expect(rowEditor(page).name).toHaveValue('cal');
  });

  test(`in the ${host}, an Undo's confirmation that lands after the form opened ends as the user types in the form`, async ({ extension, site }) => {
    const { page, view } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.pencil('cal').click();
    await rowEditor(page).delete.click();
    const confirmation = lineConfirmation(page);
    await expect(confirmation.text).toHaveText('Removed "cal" from line 3');
    const held = await holdPageRequests(page, 'undo');
    await confirmation.undo.click();
    await expect.poll(held.held).toBe(1);
    await view.addMapping.click();
    await held.release();
    await expect(confirmation.text).toHaveText('Put "cal" back as line 3');
    expect(await storedDocument(extension)).toBe(DOC);
    await nameForm(page).name.pressSequentially('t');
    await expect(confirmation.text).toHaveCount(0);
    await expect(nameForm(page).name).toHaveValue('t');
  });

  test(`in the ${host}, one form or editor is open at a time: Add mapping closes an open editor and a pencil the open form, each storing nothing`, async ({ extension, site }) => {
    const { page, view } = await listViewIn(host, extension, site, { mappings: DOC });
    await view.pencil('cal').click();
    const editor = rowEditor(page);
    await editor.note.fill('typed');
    await view.addMapping.click();
    await expect(editor.note).toHaveCount(0);
    const form = nameForm(page);
    await expect(form.name).toBeFocused();
    await form.name.fill('typed too');
    await view.pencil('mail').click();
    await expect(form.form).toHaveCount(0);
    await expect(editor.name).toHaveValue('mail');
    await expect(editor.note).toHaveValue('');
    await expect(view.addMapping).toBeVisible();
    expect(await storedDocument(extension)).toBe(DOC);
  });
}

// The accessibility pass over sixty rows takes ten seconds a state; the checks above hold these states to it.
test('in the popup, Add mapping after sixty lines shows the form from its top, as much as the view holds, and the form, a taken name, and the confirmation each fit', async ({ extension, site }) => {
  const lines: string[] = [];
  for (let index = 1; index <= 60; index++) {
    // Headings, so the Section choice makes the form taller than the view.
    if (index % 12 === 1) lines.push(`\\ Section ${index}`);
    lines.push(lineOf(`m${index}`, `https://m${index}.example/`));
  }
  const { page, view } = await listViewIn('popup', extension, site, { mappings: lines.join('\n') });
  const check = () => checkFit(page);
  await view.addMapping.click();
  const form = nameForm(page);
  await expect(form.name).toBeFocused();
  await expect(form.sections).toBeVisible();
  const shown = await page.evaluate(() => {
    const scrolling = document.querySelector('.view')!.getBoundingClientRect();
    const box = document.querySelector('.list-name-form')!.getBoundingClientRect();
    return { top: box.top - scrolling.top, visible: Math.min(box.bottom, scrolling.bottom) - box.top, held: Math.min(box.height, scrolling.height) };
  });
  expect(shown.top).toBeGreaterThanOrEqual(0);
  expect(shown.visible).toBeGreaterThanOrEqual(shown.held - 1);
  await check();
  await form.name.fill('m3');
  await form.url.fill('https://m3.example/again');
  await expect(form.problem).toHaveText('Line 4 already has the name "m3".');
  await expect(form.editInstead).toBeVisible();
  await check();
  await form.name.fill('m61');
  await form.save.click();
  await expect(lineConfirmation(page).text).toHaveText('Saved "m61" as line 66');
  await expect(lineConfirmation(page).undo).toBeInViewport();
  await expect(view.pencil('m61')).toBeFocused();
  await check();
});

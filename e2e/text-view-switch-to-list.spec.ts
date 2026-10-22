// The switch from the Text view to the List view over unsaved changes, in both settings hosts (G19; In use,
// "Edit the text"; G17, G18, G21, G7, G32, L2): it asks, *Save and switch*, *Keep the draft and switch*, or
// *Stay*, at the top of the view with its first answer focused, the text area taking no typing and the view's
// Save waiting meanwhile; only a Save that stores the text switches, and one that stores nothing stays with its
// errors, its offer, or what Chrome said, the text as typed; *Save and switch* waits whenever Save would; the
// kept draft is offered back in the Text view; *Stay* gives the text area back; with nothing unsaved, and for
// Preferences or a return to search, the switch asks nothing; a switch made while Import's file waits to go into
// the text area waits with it, then asks (G20); and every state of the question fits the popup and passes the
// accessibility pass.
import type { Locator, Page } from '@playwright/test';
import {
  draftLanded,
  expect,
  holdPageReads,
  holdPageRequests,
  importFile,
  listView,
  listViewIn,
  refuseWorkerStorage,
  SETTINGS_HOSTS,
  storedDraft,
  test,
  textView,
  textViewIn,
  typeAtEnd,
  type LoadedExtension,
} from './extension.ts';

const DOC = 'mail  https://mail.example/\ncal  https://cal.example/\nnews  https://news.example/\n';
const NEW_LINE = 'new  https://new.example/\n';
const CHANGED = 'Not saved: the stored document changed after this text was loaded, in another view or window. Your text is kept as you typed it.';

const footer = (page: Page) => page.locator('footer');
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name, exact: true });
const focusOnNothing = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);

async function storedDocument(extension: LoadedExtension) {
  return (await extension.readStorage()).mappings;
}

for (const host of SETTINGS_HOSTS) {
  const says = (page: Page, text: string) => (host === 'popup' ? expect(footer(page)).toHaveText(text) : expect(footer(page)).toHaveCount(0));

  test(`in the ${host}, a switch to List over unsaved text asks first, its first answer focused, the text area and Save waiting; Keep the draft and switch shows the List view, the text kept against the document it was typed on and offered back`, async ({ extension, site }) => {
    const { page, view, check } = await textViewIn(host, extension, site, { mappings: DOC });
    await typeAtEnd(view, 'x');
    await nav(page, 'List').focus();
    await says(page, 'Enter shows List, first asking about any unsaved text');
    await page.keyboard.press('Enter');
    await expect(view.switchQuestion).toBeVisible();
    await expect(view.saveAndSwitch).toBeFocused();
    // At the top of the view, the Text view still the one shown, and nothing stored.
    expect((await view.switchQuestion.boundingBox())!.y).toBeLessThan((await page.locator('#text-view-hint').boundingBox())!.y);
    await expect(nav(page, 'Text')).toHaveAttribute('aria-current', 'page');
    await expect(listView(page).list).toHaveCount(0);
    await expect(view.area).not.toBeEditable();
    await expect(view.area).toHaveValue(`${DOC}x`);
    expect(await storedDocument(extension)).toBe(DOC);
    await says(page, 'Enter saves the text and shows the List view');
    await page.keyboard.press('Tab');
    await expect(view.keepAndSwitch).toBeFocused();
    await says(page, 'Enter keeps the unsaved text for later and shows the List view');
    await page.keyboard.press('Tab');
    await expect(view.stay).toBeFocused();
    await says(page, 'Enter stays in the Text view');
    await check();
    // The view's own Save waits: Enter on it saves nothing and lists nothing.
    await view.save.focus();
    await says(page, 'Enter does nothing until the switch to List is answered');
    await page.keyboard.press('Enter');
    await expect(view.switchQuestion).toBeVisible();
    await expect(view.status).toHaveText('');
    expect(await storedDocument(extension)).toBe(DOC);

    await view.keepAndSwitch.focus();
    await page.keyboard.press('Enter');
    await expect(listView(page).list).toBeVisible();
    await expect(nav(page, 'List')).toHaveAttribute('aria-current', 'page');
    expect(await focusOnNothing(page)).toBe(false);
    await draftLanded(extension, `${DOC}x`);
    expect(await storedDraft(extension.worker)).toMatchObject({ text: `${DOC}x`, base: DOC });
    await nav(page, 'Text').click();
    await expect(view.keptOffer).toBeVisible();
    await view.resume.click();
    await expect(view.area).toHaveValue(`${DOC}x`);
    expect(await storedDocument(extension)).toBe(DOC);
  });

  test(`in the ${host}, Save and switch with a valid new line stores the text and shows the List view listing it; the draft goes, and the Text view offers nothing`, async ({ extension, site }) => {
    const { page, view } = await textViewIn(host, extension, site, { mappings: DOC });
    await typeAtEnd(view, NEW_LINE);
    await nav(page, 'List').click();
    await view.saveAndSwitch.click();
    await expect(listView(page).pencil('new')).toBeVisible();
    await expect(nav(page, 'List')).toHaveAttribute('aria-current', 'page');
    expect(await focusOnNothing(page)).toBe(false);
    expect(await storedDocument(extension)).toBe(`${DOC}${NEW_LINE}`);
    await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
    await nav(page, 'Text').click();
    await expect(view.area).toBeEditable();
    await expect(view.keptOffer).toHaveCount(0);
    await expect(view.area).toHaveValue(`${DOC}${NEW_LINE}`);
  });

  test(`in the ${host}, Save and switch over a line with a name and no URL stays: nothing stored, the error listed by its line, the text as typed, the question gone`, async ({ extension, site }) => {
    const { page, view } = await textViewIn(host, extension, site, { mappings: DOC });
    await typeAtEnd(view, 'just-a-name');
    await nav(page, 'List').click();
    await view.saveAndSwitch.click();
    await expect(view.status).toHaveText('Not saved');
    await expect(view.errors).toHaveText(['Line 4: expected a name and a URL']);
    await expect(view.switchQuestion).toHaveCount(0);
    await expect(nav(page, 'Text')).toHaveAttribute('aria-current', 'page');
    await expect(view.area).toHaveValue(`${DOC}just-a-name`);
    await expect(view.area).toBeEditable();
    // The focus where a plain Save leaves it.
    await expect(view.save).toBeFocused();
    await draftLanded(extension, `${DOC}just-a-name`);
    expect(await storedDocument(extension)).toBe(DOC);
    // Still unsaved: the next switch asks again.
    await nav(page, 'List').click();
    await expect(view.switchQuestion).toBeVisible();
  });

  test(`in the ${host}, Save and switch after another page changed the document stays with the offer to bring the change in, nothing stored; asked again, Save and switch waits while Keep the draft and switch still switches`, async ({ extension, site }) => {
    // Opened before the popup, which a tab opening later can close.
    const other = await extension.openRequestPage();
    const { page, view, check } = await textViewIn(host, extension, site, { mappings: DOC });
    const typed = 'mine  https://mine.example/\n';
    await typeAtEnd(view, typed);
    expect(await other.send({ kind: 'insert', name: 'other', url: 'https://other.example/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
    const changed = await storedDocument(extension);
    expect(changed).not.toBe(DOC);
    await nav(page, 'List').click();
    await view.saveAndSwitch.click();
    await expect(view.status).toHaveText(CHANGED);
    await expect(view.offer).toBeVisible();
    await expect(view.switchQuestion).toHaveCount(0);
    await expect(view.area).toHaveValue(`${DOC}${typed}`);
    expect(await storedDocument(extension)).toBe(changed);

    await nav(page, 'List').click();
    await expect(view.switchQuestion).toBeVisible();
    await expect(view.saveAndSwitch).toBeFocused();
    await expect(view.saveAndSwitch).toHaveAttribute('aria-disabled', 'true');
    await expect(view.keepAndSwitch).not.toHaveAttribute('aria-disabled', 'true');
    await says(page, 'Enter does nothing until the change is brought in');
    await check();
    await page.keyboard.press('Enter');
    await expect(view.switchQuestion).toBeVisible();
    await expect(view.offer).toBeVisible();
    expect(await storedDocument(extension)).toBe(changed);
    await view.keepAndSwitch.click();
    await expect(listView(page).list).toBeVisible();
    // Kept against the document it was typed on, so a resumed Save is refused and reaches the merge again.
    expect(await storedDraft(extension.worker)).toMatchObject({ text: `${DOC}${typed}`, base: DOC });
    expect(await storedDocument(extension)).toBe(changed);
  });

  test(`in the ${host}, Save and switch that Chrome refuses to store stays and says so, the text as typed, the question gone`, async ({ extension, site }) => {
    const { page, view } = await textViewIn(host, extension, site, { mappings: DOC });
    await typeAtEnd(view, NEW_LINE);
    await draftLanded(extension, `${DOC}${NEW_LINE}`);
    await refuseWorkerStorage(extension.worker, 'set', 'Quota exceeded');
    await nav(page, 'List').click();
    await view.saveAndSwitch.click();
    await expect(view.status).toHaveText('Not saved: your text is kept as you typed it. Chrome said: Quota exceeded');
    await expect(view.switchQuestion).toHaveCount(0);
    await expect(nav(page, 'Text')).toHaveAttribute('aria-current', 'page');
    await expect(view.area).toHaveValue(`${DOC}${NEW_LINE}`);
    await expect(view.area).toBeEditable();
    expect(await storedDocument(extension)).toBe(DOC);
    expect((await storedDraft(extension.worker))?.text).toBe(`${DOC}${NEW_LINE}`);
  });

  test(`in the ${host}, Stay gives the text area back with the focus and the caret where it was, the text as typed; a later switch asks again`, async ({ extension, site }) => {
    const { page, view } = await textViewIn(host, extension, site, { mappings: DOC });
    await typeAtEnd(view, 'x');
    await nav(page, 'List').click();
    await view.stay.click();
    await expect(view.switchQuestion).toHaveCount(0);
    await expect(view.area).toBeFocused();
    await expect(view.area).toBeEditable();
    expect(await view.area.evaluate((area: HTMLTextAreaElement) => [area.selectionStart, area.selectionEnd])).toEqual([DOC.length + 1, DOC.length + 1]);
    await says(page, 'Enter starts a new line');
    await page.keyboard.type('y');
    await expect(view.area).toHaveValue(`${DOC}xy`);
    expect(await storedDocument(extension)).toBe(DOC);
    await nav(page, 'List').click();
    await expect(view.switchQuestion).toBeVisible();
    await expect(view.saveAndSwitch).toBeFocused();
  });

  test(`in the ${host}, a switch to List asks nothing without unsaved changes: untouched, typed back, a CRLF document untouched, after an applied Save, and while a kept draft is offered`, async ({ extension, site }) => {
    const { page, view } = await textViewIn(host, extension, site, { mappings: DOC });
    // The footer on the List button is true with or without unsaved text, whose state can change under it.
    await nav(page, 'List').focus();
    await says(page, 'Enter shows List, first asking about any unsaved text');
    const switchesAtOnce = async (what: string) => {
      await nav(page, 'List').click();
      await expect(listView(page).list, what).toBeVisible();
      await expect(view.switchQuestion, what).toHaveCount(0);
    };
    const textAgain = async () => {
      await nav(page, 'Text').click();
      await expect(view.area).toBeEditable();
      await expect(view.keptOffer).toHaveCount(0);
    };
    await switchesAtOnce('untouched');

    await textAgain();
    await typeAtEnd(view, 'x');
    await page.keyboard.press('Backspace');
    await expect(view.area).toHaveValue(DOC);
    await switchesAtOnce('typed back');

    // The text area shows a CRLF document with LF endings (S14), which is no change of the user's.
    const crlf = DOC.replaceAll('\n', '\r\n');
    await extension.seedStorage({ mappings: crlf });
    await textAgain();
    await expect(view.area).toHaveValue(DOC);
    await switchesAtOnce('a CRLF document untouched');

    await textAgain();
    await typeAtEnd(view, NEW_LINE);
    await view.save.click();
    await expect(view.status).toHaveText('Saved');
    await switchesAtOnce('after an applied Save');
    expect(await storedDocument(extension)).toBe(`${DOC}${NEW_LINE}`);

    // Another view's draft offered: the text area holds the stored document, and the draft stays kept.
    const draft = { text: `${DOC}kept`, base: DOC, time: Date.now(), view: 'another-text-view', number: 1 };
    await extension.seedStorage({ mappings: DOC, draft });
    await nav(page, 'Text').click();
    await expect(view.keptOffer).toBeVisible();
    await switchesAtOnce('while a kept draft is offered');
    expect(await storedDraft(extension.worker)).toEqual(draft);
  });

  test(`in the ${host}, on a document stored with CRLF endings, text typed and typed back is kept as the draft with LF endings, which the stored document does not hold: the switch asks`, async ({ extension, site }) => {
    const crlf = DOC.replaceAll('\n', '\r\n');
    const { page, view } = await textViewIn(host, extension, site, { mappings: crlf });
    await typeAtEnd(view, 'x');
    await page.keyboard.press('Backspace');
    await expect(view.area).toHaveValue(DOC);
    await draftLanded(extension, DOC);
    await nav(page, 'List').click();
    await expect(view.switchQuestion).toBeVisible();
    await view.keepAndSwitch.click();
    await expect(listView(page).list).toBeVisible();
    expect(await storedDraft(extension.worker)).toMatchObject({ text: DOC, base: crlf });
    expect(await storedDocument(extension)).toBe(crlf);
  });

  test(`in the ${host}, a question whose text another page stores while it shows has nothing left to ask: it goes, and the List view shows`, async ({ extension, site }) => {
    // Opened before the popup, which a tab opening later can close.
    const other = await extension.openRequestPage();
    const { page, view } = await textViewIn(host, extension, site, { mappings: DOC });
    await typeAtEnd(view, NEW_LINE);
    await nav(page, 'List').click();
    await expect(view.switchQuestion).toBeVisible();
    expect(await other.send({ kind: 'replace', text: `${DOC}${NEW_LINE}`, base: DOC })).toMatchObject({ kind: 'applied' });
    await expect(listView(page).pencil('new')).toBeVisible();
    await expect(view.switchQuestion).toHaveCount(0);
    await expect(nav(page, 'List')).toHaveAttribute('aria-current', 'page');
    expect(await focusOnNothing(page)).toBe(false);
  });

  test(`in the ${host}, a switch to Preferences over unsaved text asks nothing and keeps the text${host === 'popup' ? ', as Back to search does' : ''}`, async ({ extension, site }) => {
    const { page, view } = await textViewIn(host, extension, site, { mappings: DOC });
    await typeAtEnd(view, 'x');
    await nav(page, 'Preferences').click();
    await expect(page.getByRole('listbox', { name: 'Search order' })).toBeVisible();
    await expect(view.switchQuestion).toHaveCount(0);
    await draftLanded(extension, `${DOC}x`);
    await nav(page, 'Text').click();
    await expect(view.keptOffer).toBeVisible();
    await view.resume.click();
    await expect(view.area).toHaveValue(`${DOC}x`);
    if (host === 'popup') {
      await typeAtEnd(view, 'y');
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(page.getByRole('combobox')).toBeVisible();
      await expect(view.switchQuestion).toHaveCount(0);
      await draftLanded(extension, `${DOC}xy`);
    }
    expect(await storedDocument(extension)).toBe(DOC);
  });

  test(`in the ${host}, a switch asked while a Save awaits its reply: Save and switch waits and says why; once the Save stores the text, the question goes and the List view shows`, async ({ extension, site }) => {
    const { page, view, check } = await textViewIn(host, extension, site, { mappings: DOC });
    await typeAtEnd(view, NEW_LINE);
    const replaces = await holdPageRequests(page, 'replace');
    await view.save.click();
    await expect.poll(() => replaces.held()).toBe(1);
    await nav(page, 'List').click();
    await expect(view.switchQuestion).toBeVisible();
    await expect(view.saveAndSwitch).toBeFocused();
    await expect(view.saveAndSwitch).toHaveAttribute('aria-disabled', 'true');
    await expect(view.keepAndSwitch).not.toHaveAttribute('aria-disabled', 'true');
    await says(page, 'Saving · Enter does nothing until it is stored');
    await check();
    expect(await storedDocument(extension)).toBe(DOC);
    await replaces.release();
    await expect(listView(page).pencil('new')).toBeVisible();
    await expect(nav(page, 'List')).toHaveAttribute('aria-current', 'page');
    expect(await focusOnNothing(page)).toBe(false);
    expect(await storedDocument(extension)).toBe(`${DOC}${NEW_LINE}`);
  });
}

test("on the options page, a switch to List made while Import's file waits for the Text view's first read waits with it, then asks; Keep the draft and switch keeps the file, offered back", async ({ extension, site }) => {
  const imported = `${DOC}${NEW_LINE}`;
  const { page, view, check } = await textViewIn('options page', extension, site, { mappings: DOC });
  // Every read the page makes answers late from here on, as a busy page hears them: the Text view opened by
  // Import takes no typing, and its file waits, until its first read answers.
  const reads = await holdPageReads(page);
  await importFile(page, 'new.txt', Buffer.from(imported));
  await expect.poll(() => reads.held()).toBeGreaterThan(0);
  await expect(view.area).not.toBeEditable();
  await nav(page, 'List').click();
  const answeredUntil = (shown: Locator) =>
    expect
      .poll(async () => {
        while ((await reads.held()) > 0) await reads.release();
        return shown.isVisible();
      })
      .toBe(true);
  await answeredUntil(view.switchQuestion);
  await expect(view.saveAndSwitch).toBeFocused();
  await expect(view.area).toHaveValue(imported);
  await check();
  await view.keepAndSwitch.click();
  await answeredUntil(listView(page).addMapping);
  await draftLanded(extension, imported);
  await nav(page, 'Text').click();
  await answeredUntil(view.keptOffer);
  expect(await storedDocument(extension)).toBe(DOC);
});

test("on the options page, a switch to List made while a kept draft the document holds is dropped, before Import's file goes in, waits with the file, then asks", async ({ extension, site }) => {
  const imported = `${DOC}${NEW_LINE}`;
  const { page, check } = await textViewIn('options page', extension, site, { mappings: DOC });
  await check();
  const discards = await holdPageRequests(page, 'draft-discard');
  await extension.worker.evaluate((draft) => chrome.storage.local.set({ draft }), { text: DOC, base: 'a  https://a/\n', time: 1_700_000_000_000, view: 'earlier-view', number: 4 });
  await importFile(page, 'new.txt', Buffer.from(imported));
  await expect.poll(() => discards.held()).toBe(1);
  await nav(page, 'List').click();
  const view = textView(page);
  await expect(nav(page, 'Text')).toHaveAttribute('aria-current', 'page');
  await discards.release();
  await expect(view.switchQuestion).toBeVisible();
  await check();
  await expect(view.area).toHaveValue(imported);
  await view.keepAndSwitch.click();
  await expect(listView(page).addMapping).toBeVisible();
  await draftLanded(extension, imported);
  await check();
  expect(await storedDocument(extension)).toBe(DOC);
});

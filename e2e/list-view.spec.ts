// The List view in both settings hosts (In use, "Edit the list"; F14, G7, G16, G19, G31, G32, L2, P2; State):
// the document in document order by its own line numbers, a heading once by its text or its first line, a
// mapping's name, URL, and note, an unreadable line's raw text whole with *Fix in text*, which shows the host's
// Text view on that line, and no blank line; every row control reached by Tab with the footer naming its line;
// a pencil opening the editor in the row's place; the list following every change to the stored document;
// and every state fitting and passing the accessibility pass. Its edits are `list-view-edit.spec.ts`'s.
import type { Page } from '@playwright/test';
import {
  caret,
  checkFit,
  checkFitAndAccessibility,
  closingPopup,
  expect,
  listView,
  listViewIn,
  popupOnNewPage,
  rowEditor,
  SETTINGS_HOSTS,
  test,
  textView,
  textViewInPopup,
  typeAtEnd,
  type ListView,
  type LoadedExtension,
  type LocalSite,
  type SettingsHost,
} from './extension.ts';

const DOC = [
  '\\ Daily',
  '\\ second heading line',
  'mail  https://mail.example/  \\ its note',
  '',
  'cal\thttps://cal.example/',
  'just-a-name',
  '\\',
  'last  https://l.example/',
].join('\n');

const footer = (page: Page) => page.locator('footer');
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name, exact: true });

/** The List view in `host` on the document `mappings`, with any other stored keys in `also`. */
const listIn = (host: SettingsHost, extension: LoadedExtension, site: LocalSite, mappings: string, also: Record<string, unknown> = {}) =>
  listViewIn(host, extension, site, { mappings, ...also });

/** The list's items in order, each as `heading: …`, `row N`, `editor`, or `confirmation`. */
function items(view: ListView) {
  return view.list.locator(':scope > li').evaluateAll((lis) =>
    lis.map((li) =>
      li.classList.contains('list-heading')
        ? `heading: ${li.textContent}`
        : li.classList.contains('list-row')
          ? `row ${li.querySelector('.list-number')!.textContent}`
          : li.classList.contains('list-editor')
            ? 'editor'
            : 'confirmation',
    ),
  );
}

for (const host of SETTINGS_HOSTS) {
  test(`in the ${host}, the document is listed by its own line numbers: one heading per run of comment lines, each mapping with its note, the unreadable line with Fix in text, no blank line`, async ({ extension, site }) => {
    const { page, view, check } = await listIn(host, extension, site, DOC);
    expect(await items(view)).toEqual(['heading: Daily second heading line', 'row 3', 'row 5', 'row 6', 'heading: Heading at line 7', 'row 8']);
    await expect(view.names).toHaveText(['mail', 'cal', 'last']);
    await expect(view.urls).toHaveText(['https://mail.example/', 'https://cal.example/', 'https://l.example/']);
    await expect(view.notes).toHaveText(['its note']);
    await expect(view.raw).toHaveText(['just-a-name']);
    await expect(view.unreadableRows.locator('.list-number')).toHaveText(['6']);
    await expect(view.unreadableRows).toContainText('Line 6: expected a name and a URL');
    // A mapping row's one control is its pencil, an unreadable row's Fix in text alone (G16).
    await expect(view.mappingRows.getByRole('button')).toHaveCount(3);
    await expect(view.pencils).toHaveCount(3);
    for (const name of ['mail', 'cal', 'last']) await expect(view.pencil(name)).toBeVisible();
    await expect(view.unreadableRows.getByRole('button')).toHaveText(['Fix in text']);
    await expect(view.empty).toHaveCount(0);
    await expect(nav(page, 'List')).toHaveAttribute('aria-current', 'page');
    await check();
  });

  test(`in the ${host}, Tab from the views reaches each pencil and Fix in text in document order, the footer naming each line; a pencil opens the editor in its row`, async ({ extension, site }) => {
    const { page, view, check } = await listIn(host, extension, site, DOC);
    const says = (text: string) => (host === 'popup' ? expect(footer(page)).toHaveText(text) : expect(footer(page)).toHaveCount(0));
    await nav(page, 'List').focus();
    const walk: [ReturnType<typeof view.pencil>, string][] = [
      [view.pencil('mail'), 'Enter edits line 3'],
      [view.pencil('cal'), 'Enter edits line 5'],
      [view.fixInText, 'Enter shows the Text view at line 6'],
      [view.pencil('last'), 'Enter edits line 8'],
    ];
    // After List: Text, in the popup Open in tab, then the view.
    for (let stop = 0; stop < (host === 'popup' ? 3 : 2); stop++) await page.keyboard.press('Tab');
    for (const [control, text] of walk) {
      if (control !== walk[0]![0]) await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      await says(text);
    }

    await view.pencil('mail').focus();
    await page.keyboard.press('Enter');
    const editor = rowEditor(page);
    await expect(editor.name).toBeFocused();
    await expect(editor.name).toHaveValue('mail');
    expect(await editor.name.evaluate((field: HTMLInputElement) => [field.selectionStart, field.selectionEnd])).toEqual([4, 4]);
    await expect(editor.note).toHaveValue('its note');
    expect(await items(view)).toEqual(['heading: Daily second heading line', 'editor', 'row 5', 'row 6', 'heading: Heading at line 7', 'row 8']);
    await says('Enter saves line 3');
    // No Open in text here: Fix in text is the List view's way to the Text view.
    await expect(editor.openInText).toHaveCount(0);
    await check();

    await editor.cancel.click();
    await expect(view.pencil('mail')).toBeFocused();
    expect(await items(view)).toEqual(['heading: Daily second heading line', 'row 3', 'row 5', 'row 6', 'heading: Heading at line 7', 'row 8']);
    await view.pencil('cal').click();
    await expect(editor.name).toBeFocused();
    await expect(editor.name).toHaveValue('cal');
    expect(await items(view)).toEqual(['heading: Daily second heading line', 'row 3', 'editor', 'row 6', 'heading: Heading at line 7', 'row 8']);
    // Another pencil closes it, storing nothing, and opens its own.
    await view.pencil('last').click();
    await expect(editor.name).toHaveValue('last');
    await expect(editor.name).toHaveCount(1);
    expect(await items(view)).toEqual(['heading: Daily second heading line', 'row 3', 'row 5', 'row 6', 'heading: Heading at line 7', 'editor']);
    expect((await extension.readStorage()).mappings).toBe(DOC);
  });

  test(`in the ${host}, Fix in text by Enter and by click shows the Text view with the caret on that line`, async ({ extension, site }) => {
    const { page, view, check } = await listIn(host, extension, site, DOC);
    const text = textView(page);
    for (const activation of ['Enter', 'click'] as const) {
      if (activation === 'Enter') {
        await view.fixInText.focus();
        if (host === 'popup') await expect(footer(page)).toHaveText('Enter shows the Text view at line 6');
        await page.keyboard.press('Enter');
      } else await view.fixInText.click();
      await expect(text.area).toHaveValue(DOC);
      await expect.poll(() => caret(text.area), { message: activation }).toEqual({ focused: true, line: 6, atLineStart: true, inView: true });
      await expect(nav(page, 'Text')).toHaveAttribute('aria-current', 'page');
      await expect(nav(page, 'List')).not.toHaveAttribute('aria-current', 'page');
      await check();
      await nav(page, 'List').click();
      await expect(view.fixInText).toBeVisible();
    }
    // The line is for that showing alone: Text shown again from the views starts at the top.
    await nav(page, 'Text').click();
    await expect(text.area).toBeEditable();
    expect(await text.area.evaluate((area: HTMLTextAreaElement) => area.selectionStart)).toBe(0);
  });

  test(`in the ${host}, Fix in text with a kept draft of unsaved changes offers it first, and the caret goes to the line once it is answered`, async ({ extension, site }) => {
    const draft = { text: `${DOC}\nmine  https://mine/`, base: DOC, time: 1_700_000_000_000, view: 'earlier-view', number: 4 };
    for (const answer of ['resume', 'discard'] as const) {
      const { page, view } = await listIn(host, extension, site, DOC, { draft });
      await view.fixInText.click();
      const text = textView(page);
      await expect(text.keptOffer).toBeVisible();
      await expect(text.resume).toBeFocused();
      await text[answer].click();
      await expect(text.area).toHaveValue(answer === 'resume' ? draft.text : DOC);
      await expect.poll(() => caret(text.area), { message: answer }).toEqual({ focused: true, line: 6, atLineStart: true, inView: true });
      await page.close();
    }
  });

  test(`in the ${host}, an unreadable line's raw text keeps its tab and spaces as written`, async ({ extension, site }) => {
    const { view, check } = await listIn(host, extension, site, 'a  https://a/\nbroken\t   address\n');
    expect(await view.raw.evaluate((raw) => raw.textContent)).toBe('broken\t   address');
    // Drawn as written: wider than the same text in the same font with its whitespace collapsed, and set not to collapse it.
    const widths = await view.raw.evaluate((raw) => {
      const collapsed = raw.cloneNode(true) as HTMLElement;
      collapsed.style.cssText = 'position: absolute; white-space: normal; width: max-content';
      document.body.append(collapsed);
      const textWidth = (element: Element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getBoundingClientRect().width;
      };
      const width = { raw: textWidth(raw), collapsed: textWidth(collapsed), whiteSpace: getComputedStyle(raw).whiteSpace };
      collapsed.remove();
      return width;
    });
    expect(widths.whiteSpace).toBe('pre-wrap');
    expect(widths.raw).toBeGreaterThan(widths.collapsed + 20);
    await check();
  });

  test(`in the ${host}, an empty document lists nothing and says so, with no control in the view and the focus left on List`, async ({ extension, site }) => {
    const { page, view, check } = await listIn(host, extension, site, '');
    await nav(page, 'List').focus();
    await expect(view.empty).toBeVisible();
    await expect(view.list).toHaveCount(0);
    await expect(page.locator('.list-view').getByRole('button')).toHaveCount(0);
    await expect(nav(page, 'List')).toBeFocused();
    await check();
  });

  test(`in the ${host}, the list follows another page's changes: an inserted line appears with its number and the numbers below move`, async ({ extension, site }) => {
    // Opened before the popup, whose focus a tab opened later would take.
    const other = await extension.openRequestPage();
    const { view, check } = await listIn(host, extension, site, DOC);
    await expect(view.numbers).toHaveText(['3', '5', '6', '8']);
    // Into the Daily section, after its last line that holds text (G9).
    expect(await other.send({ kind: 'insert', name: 'news', url: 'https://news.example/', note: '', heading: { texts: ['\\ Daily', '\\ second heading line'], before: 0 } })).toMatchObject({ kind: 'applied', line: 7 });
    await expect(view.numbers).toHaveText(['3', '5', '6', '7', '9']);
    await expect(view.names).toHaveText(['mail', 'cal', 'news', 'last']);
    await expect(view.unreadableRows.locator('.list-number')).toHaveText(['6']);
    await expect(view.headings).toHaveText(['Daily second heading line', 'Heading at line 8']);
    expect(await other.send({ kind: 'remove', line: 3, text: 'mail  https://mail.example/  \\ its note' })).toMatchObject({ kind: 'applied' });
    await expect(view.names).toHaveText(['cal', 'news', 'last']);
    await expect(view.numbers).toHaveText(['4', '5', '6', '8']);
    await check();
  });
}

for (const host of SETTINGS_HOSTS) {
  test(`in the ${host}, a focused pencil that another page's insertions push down is kept in view`, async ({ extension, site }) => {
    const other = await extension.openRequestPage();
    const { page, view } = await listIn(host, extension, site, '\\ Top\na  https://a/\n\\ Bottom\nb  https://b/');
    await view.pencil('b').focus();
    for (let i = 0; i < 40; i++) expect(await other.send({ kind: 'insert', name: `n${i}`, url: `https://n${i}/`, note: '', heading: { texts: ['\\ Top'], before: 0 } })).toMatchObject({ kind: 'applied' });
    await expect(view.pencils).toHaveCount(42);
    await expect(view.pencil('b')).toBeFocused();
    await expect(view.pencil('b')).toBeInViewport();
    if (host === 'popup') await expect(footer(page)).toHaveText('Enter edits line 44');
  });
}

test("in the popup, the footer on a focused pencil follows its line's new number when another page removes a line above it", async ({ extension, site }) => {
  const other = await extension.openRequestPage();
  const { page, view } = await listIn('popup', extension, site, 'a  https://a/\nb  https://b/\n\\ c\njust-a-name');
  await view.pencil('b').focus();
  await expect(footer(page)).toHaveText('Enter edits line 2');
  expect(await other.send({ kind: 'remove', line: 1, text: 'a  https://a/' })).toMatchObject({ kind: 'applied' });
  await expect(view.numbers).toHaveText(['1', '3']);
  await expect(view.pencil('b')).toBeFocused();
  await expect(footer(page)).toHaveText('Enter edits line 1');
  await view.fixInText.focus();
  expect(await other.send({ kind: 'insert', name: 'z', url: 'https://z/', note: '', heading: null })).toMatchObject({ kind: 'applied', line: 4 });
  expect(await other.send({ kind: 'remove', line: 1, text: 'b  https://b/' })).toMatchObject({ kind: 'applied' });
  await expect(view.numbers).toHaveText(['2', '3']);
  await expect(footer(page)).toHaveText('Enter shows the Text view at line 2');
});

test('in the popup, a long name, URL, and note are each shown from their start and cut with an ellipsis, a right-to-left name too; a long unreadable line wraps whole', async ({ extension, site }) => {
  const long = (letter: string) => letter.repeat(300);
  const rtl = 'שלום'.repeat(75);
  const doc = [`${long('n')}  https://${long('u')}/  \\ ${long('t')}`, `${rtl}  https://rtl.example/`, `${long('x')}y`].join('\n');
  const { page, view } = await listIn('popup', extension, site, doc);
  await expect(view.names).toHaveText([long('n'), rtl]);
  for (const field of [view.names.first(), view.urls.first(), view.notes.first(), view.names.nth(1)]) {
    expect(await field.evaluate((element) => element.scrollWidth > element.clientWidth && getComputedStyle(element).textOverflow === 'ellipsis')).toBe(true);
  }
  // Never cut: as wide as its box, several lines tall.
  const raw = await view.raw.evaluate((element) => ({ cut: element.scrollWidth > element.clientWidth, lines: element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight) }));
  expect(raw.cut).toBe(false);
  expect(raw.lines).toBeGreaterThan(3);
  await checkFitAndAccessibility(page);
});

test('in the popup, twenty mappings are all listed, the view scrolling between the fixed header and footer; Open in tab opens the options page on the List view', async ({ extension, site }) => {
  const doc = Array.from({ length: 20 }, (_, i) => `m${i + 1}  https://m${i + 1}.example/`).join('\n');
  const { page, view } = await listIn('popup', extension, site, doc);
  await expect(view.rows).toHaveCount(20);
  expect(await page.locator('.view').evaluate((scroller) => scroller.scrollHeight > scroller.clientHeight)).toBe(true);
  await view.pencil('m20').scrollIntoViewIfNeeded();
  await checkFit(page);
  const opened = extension.context.waitForEvent('page');
  await closingPopup(page, () => page.getByRole('button', { name: 'Open in tab' }).click());
  const options = await opened;
  await expect(options).toHaveURL(extension.url('options.html#view=list'));
  await expect(listView(options).rows).toHaveCount(20);
  await expect(nav(options, 'List')).toHaveAttribute('aria-current', 'page');
});

test('in the popup, unsaved text in the Text view is offered back after a switch to the List view and back', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  const text = await textViewInPopup(popup);
  await typeAtEnd(text, 'x');
  await nav(popup, 'List').click();
  await expect(listView(popup).list).toBeVisible();
  await nav(popup, 'Text').click();
  await expect(text.keptOffer).toBeVisible();
  await text.resume.click();
  await expect(text.area).toHaveValue(`${DOC}x`);
  expect((await extension.readStorage()).mappings).toBe(DOC);
});

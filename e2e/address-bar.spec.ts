// The address-bar keyword `j` (In use, "Jump from the address bar"; F6, G28): the text typed after it lists the
// popup's mappings for the same text, groups (a) to (e) in G2's order, row 1 the default, each described by
// its name and URL in XML Chrome parses; Enter opens the row Chrome hands back, from the `omnibox` record the
// worker keeps (State; S2, S7), through the one jump, which records the use (G26), in the tab Chrome's
// disposition asks for. Nothing typed, or nothing matching, opens nothing (N4).
import type { Page } from '@playwright/test';
import { addressBar, checkFitAndAccessibility, chromeShows, expect, popupOnNewPage, restartWorker, selectedRow, slowWorkerReads, test, type LoadedExtension, type LocalSite } from './extension.ts';

type Usage = Record<string, number[]>;
type StoredRecord = { typed: string; rows: [number, string, string, string][]; argumentRow: number | null };

/** A request that writes nothing, which the worker runs on its queue: it wakes a stopped worker. */
const NOTHING = { kind: 'remove-intent', windowId: -1, time: 0 } as const;

const usageOf = async (extension: LoadedExtension) => (await extension.readStorage()).usage as Usage | undefined;
const recordOf = async (extension: LoadedExtension) => (await extension.readStorage()).omnibox as StoredRecord | undefined;
const tabsAt = async (extension: LoadedExtension, url: string) => (await extension.tabUrls()).filter((tabUrl) => tabUrl === url).length;

/** Chrome's later sanitizing of a content it hands back (S7): kWhitespaceUTF16 trimmed from the ends, then LF, CR, tab, U+2028, U+2029 removed. */
function sanitized(content: string): string {
  const whitespace = /[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;
  let start = 0;
  let end = content.length;
  while (start < end && whitespace.test(content[start]!)) start++;
  while (end > start && whitespace.test(content[end - 1]!)) end--;
  return content.slice(start, end).replace(/[\n\r\t\u2028\u2029]/g, '');
}

/**
 * Each description as an XML parser reads it, on `page`, once Chrome's own parser has taken it as a default
 * suggestion's (S7), which it refuses for one that is not well formed.
 */
async function readDescriptions(extension: LoadedExtension, page: Page, descriptions: string[]): Promise<string[]> {
  for (const description of descriptions) await extension.worker.evaluate((description) => chrome.omnibox.setDefaultSuggestion({ description }), description);
  return page.evaluate((descriptions) => descriptions.map((description) => new DOMParser().parseFromString(`<d>${description}</d>`, 'application/xml').documentElement.textContent!), descriptions);
}

/** The popup's whole list for `typed`, each row as its name and the URL it shows, walked with Down from row 1. */
async function popupRows(popup: Page, typed: string): Promise<string[]> {
  await popup.getByRole('combobox').fill(typed);
  const selected = selectedRow(popup);
  await expect(selected).toHaveAttribute('aria-posinset', '1');
  const count = Number(await selected.getAttribute('aria-setsize'));
  const rows: string[] = [];
  for (let i = 1; i <= count; i++) {
    if (i > 1) await popup.keyboard.press('ArrowDown');
    await expect(selected).toHaveAttribute('aria-posinset', String(i));
    rows.push(`${await selected.locator('.row-name').textContent()} – ${await selected.locator('.row-url').textContent()}`);
  }
  return rows;
}

/** A page of the local site the toolbar button was clicked on, so it has Chrome's grant, its popup closed again. */
async function grantedPage(extension: LoadedExtension, site: LocalSite, title: string) {
  const page = await extension.context.newPage();
  await page.goto(site.pageUrl(title));
  await (await extension.clickToolbarButton(page)).close();
  await expect.poll(() => extension.openPopups()).toBe(0);
  return page;
}

test('nothing typed after the keyword lists nothing, and Enter then opens nothing', async ({ extension, site }) => {
  const usage = { 'gm\nhttps://gm.example/': [Date.now() - 1000] };
  await extension.seedStorage({ mappings: 'gm                   https://gm.example/\ngmail                https://mail.example/\n', usage });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const front = await extension.context.newPage();
  await front.goto(site.pageUrl('In front'));

  for (const typed of ['', '   ']) {
    const shown = await bar.type(typed);
    expect(shown.suggestions).toEqual([]);
    expect(shown.defaultDescription).toBe('Type the name of a URLJumper mapping');
    expect(await recordOf(extension)).toEqual({ typed, rows: [], argumentRow: null });
  }
  const tabs = await extension.tabUrls();
  await front.bringToFront();
  await bar.enter('', 'currentTab');
  await bar.enter('   ', 'newForegroundTab');
  expect(await extension.tabUrls()).toEqual(tabs);
  expect(await usageOf(extension)).toEqual(usage);
});

test("the suggestions are the popup's rows for the same text, in its order, under either order preference; text the popup answers with only its Name row lists none and opens nothing", async ({ extension, site }) => {
  const now = Date.now();
  // `mail` gives an exact row, prefix rows, contained names, and address matches; `st go` gives an exact row,
  // prefix rows, the argument row, and contained names. No text gives both of the last two groups: an argument
  // row's text holds a space (G1 (c)) and a URL never does (F4).
  const lines = [
    'mail https://mail.example/',
    'mailbox https://box.example/',
    'mail list https://list.example/',
    'mailer https://er.example/',
    'mails https://s.example/',
    'gmail https://gmail.example/',
    'my mail https://my.example/',
    'hotmail https://hot.example/',
    'email https://e.example/',
    'inbox https://in.example/mail',
    'post https://post.example/?to=mail',
    'letters https://mail.letters.example/',
    'chat https://chat.example/mailroom',
    'st https://st.example/?q=%s',
    'st go https://stgo.example/',
    'st gold https://gold.example/',
    'st good https://good.example/',
    'my st go https://mystgo.example/',
    'best st goal https://goal.example/',
  ];
  // Smart order: used mappings first within each group, the late lines among them.
  const usage = {
    'mails\nhttps://s.example/': [now - 60_000],
    'chat\nhttps://chat.example/mailroom': [now - 60_000],
    'best st goal\nhttps://goal.example/': [now - 60_000],
  };
  await extension.seedStorage({ mappings: lines.join('\n'), usage, searchOrder: 'smart' });
  const reader = await extension.context.newPage();
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const listed = async (typed: string) => {
    const shown = await bar.type(typed);
    return readDescriptions(extension, reader, [shown.defaultDescription!, ...shown.suggestions.map(({ description }) => description)]);
  };
  const names = (rows: string[]) => rows.map((row) => row.slice(0, row.indexOf(' – ')));

  const mail = await listed('mail');
  expect(names(mail)).toEqual(['mail', 'mails', 'mailbox', 'mail list', 'mailer', 'gmail', 'my mail', 'hotmail', 'email', 'chat', 'inbox', 'post', 'letters']);
  const stGo = await listed('st go');
  expect(stGo).toEqual([
    'st go – https://stgo.example/',
    'st gold – https://gold.example/',
    'st good – https://good.example/',
    'st – https://st.example/?q=go',
    'best st goal – https://goal.example/',
    'my st go – https://mystgo.example/',
  ]);

  const none = await bar.type('zzz');
  expect(none.suggestions).toEqual([]);
  expect(none.defaultDescription).toBe('No URLJumper mapping matches');
  const tabs = await extension.tabUrls();
  await bar.enter('zzz', 'newForegroundTab');
  expect(await extension.tabUrls()).toEqual(tabs);
  expect(await usageOf(extension)).toEqual(usage);

  // Changed in storage as Preferences changes it: the next input in the same worker follows it.
  await extension.worker.evaluate(() => chrome.storage.local.set({ searchOrder: 'document' }));
  const byLine = await listed('mail');
  expect(names(byLine)).toEqual(names(lines.slice(0, 13).map((line) => line.replace(' https://', ' – https://'))));

  await reader.close();
  await extension.worker.evaluate(() => chrome.storage.local.set({ searchOrder: 'smart' }));
  const { popup } = await popupOnNewPage(extension, site);
  expect(await popupRows(popup, 'mail')).toEqual(mail);
  expect(await popupRows(popup, 'st go')).toEqual(stGo);
  await checkFitAndAccessibility(popup);
  await popup.getByRole('combobox').fill('zzz');
  await expect(popup.getByRole('option')).toHaveCount(1);
  await expect(popup.getByRole('option')).toHaveAccessibleName('Name "zzz" for this page');
});

test("Chrome's own autocomplete shows the list in its order however long it is, and keeps apart rows whose contents it sanitizes alike", async ({ extension }) => {
  // More rows than the default's relevance (at most 1,500), which Chrome counts down by one per suggestion.
  const lines = Array.from({ length: 1_600 }, (_, i) => `m${i} https://x.example/${i}`);
  await extension.seedStorage({ mappings: lines.join('\n') });
  const long = await chromeShows(extension.context, 'x.example');
  expect(long.length).toBeGreaterThan(5);
  expect(long.map(({ contents }) => contents)).toEqual(lines.slice(0, long.length).map((line) => line.replace(' ', ' – ')));

  await extension.seedStorage({ mappings: 'a https://a.example/\nab https://ab.example/\na\tb https://atb.example/\n' });
  const shown = await chromeShows(extension.context, 'a');
  // Chrome shows a tab in a name as nothing, so the third row reads like the second.
  expect(shown.map(({ contents }) => contents)).toEqual(['a – https://a.example/', 'ab – https://ab.example/', 'ab – https://atb.example/']);
  expect(shown.map(({ fillIntoEdit }) => fillIntoEdit)).toEqual(['j a', 'j ab', 'j ab (line 3)']);
});

test("every description is XML Chrome's parser takes, reading as the name and the URL, as row 1 and as a later row", async ({ extension }) => {
  const lines = ['a https://a.example/', 'R&D <tools> https://e.example/?a=1&b=2', 'vt\u000Bname https://v.example/?c=1&d=2'];
  await extension.seedStorage({ mappings: lines.join('\n') });
  const reader = await extension.context.newPage();
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const read = async (typed: string) => {
    const shown = await bar.type(typed);
    return readDescriptions(extension, reader, [shown.defaultDescription!, ...shown.suggestions.map(({ description }) => description)]);
  };
  const rDAndD = 'R&D <tools> – https://e.example/?a=1&b=2';
  const verticalTab = 'vt\uFFFDname – https://v.example/?c=1&d=2';
  expect(await read('R&D')).toEqual([rDAndD]);
  expect(await read('vt')).toEqual([verticalTab]);
  expect(await read('.example/')).toEqual(['a – https://a.example/', rDAndD, verticalTab]);
});

test("an argument alias as the default shows its URL with %s as written, and Enter opens it with %s removed in the front tab", async ({ extension, site }) => {
  const url = 'https://www.youtube.com/results?search_query=%s';
  await extension.seedStorage({ mappings: `yt                   ${url}\n` });
  const reader = await extension.context.newPage();
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const shown = await bar.type('yt');
  expect(shown.suggestions).toEqual([]);
  const [text] = await readDescriptions(extension, reader, [shown.defaultDescription!]);
  expect(text).toBe('yt – https://www.youtube.com/results?search_query=%\u2060s');
  expect(text).not.toContain('%s');

  const front = await extension.context.newPage();
  await front.goto(site.pageUrl('In front'));
  const opened = 'https://www.youtube.com/results?search_query=';
  extension.expectExtensionRequest(opened);
  const tabs = (await extension.tabUrls()).length;
  await front.bringToFront();
  await bar.enter('yt', 'currentTab');
  await expect.poll(() => extension.tabUrls()).toContain(opened);
  expect(await extension.tabUrls()).toHaveLength(tabs);
  expect(Object.keys((await usageOf(extension))!)).toEqual([`yt\n${url}`]);
});

test("the argument row's content is its filled URL, and entering it opens that URL and records the alias's use", async ({ extension }) => {
  const url = 'https://www.youtube.com/results?search_query=%s';
  await extension.seedStorage({ mappings: `yt lo-fi mix         https://a.example/\nyt                   ${url}\n` });
  const reader = await extension.context.newPage();
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const shown = await bar.type('yt lo-fi');
  const filled = 'https://www.youtube.com/results?search_query=lo-fi';
  expect(shown.suggestions.map(({ content }) => content)).toEqual([filled]);
  expect(await readDescriptions(extension, reader, [shown.suggestions[0]!.description])).toEqual([`yt – ${filled}`]);

  await bar.enter(filled, 'newForegroundTab');
  await expect.poll(() => tabsAt(extension, filled)).toBe(1);
  expect(Object.entries((await usageOf(extension))!).map(([key, times]) => [key, times.length])).toEqual([[`yt\n${url}`, 1]]);
});

test('an alias whose lowercase name is longer than it opens the argument typed after it', async ({ extension }) => {
  const url = 'https://e.example/?q=%s';
  await extension.seedStorage({ mappings: `İ Cat list           https://e.example/list\nİ                    ${url}\n` });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const shown = await bar.type('İ Cat');
  expect(shown.suggestions.map(({ content }) => content)).toEqual(['https://e.example/?q=Cat']);
  await bar.enter('https://e.example/?q=Cat', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, 'https://e.example/?q=Cat')).toBe(1);
  expect(Object.entries((await usageOf(extension))!).map(([key, times]) => [key, times.length])).toEqual([[`i̇\n${url}`, 1]]);
});

test('contents Chrome would take for one another, or for the typed text, differ, and each one entered as given or sanitized opens its own row', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'a https://a.example/\nab https://ab.example/\na\tb https://atb.example/\n' });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const shown = await bar.type('a');
  const contents = shown.suggestions.map(({ content }) => content);
  expect(contents).toEqual(['ab', 'a\tb (line 3)']);
  expect(new Set(contents.map(sanitized)).size).toBe(2);

  const urls = ['https://ab.example/', 'https://atb.example/'];
  for (const [i, content] of contents.entries()) {
    for (const [n, entered] of [content, sanitized(content)].entries()) {
      await bar.enter(entered, 'newBackgroundTab');
      await expect.poll(() => tabsAt(extension, urls[i]!), JSON.stringify(entered)).toBe(n + 1);
    }
  }
  await bar.enter('a', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, 'https://a.example/')).toBe(1);
});

test("a row whose content Chrome trims to the typed text takes its line, whether its name or only its address matched; the typed text still opens row 1", async ({ extension }) => {
  await extension.seedStorage({ mappings: 'ab https://ab.example/\nab\u0085 https://nel.example/\na\tb https://x.example/ab\n' });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const shown = await bar.type('ab');
  const contents = shown.suggestions.map(({ content }) => content);
  expect(contents).toEqual(['ab\u0085 (line 2)', 'a\tb (line 3)']);

  await bar.enter('ab', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, 'https://ab.example/')).toBe(1);
  const urls = ['https://nel.example/', 'https://x.example/ab'];
  for (const [i, content] of contents.entries()) {
    for (const [n, entered] of [content, sanitized(content)].entries()) {
      await bar.enter(entered, 'newBackgroundTab');
      await expect.poll(() => tabsAt(extension, urls[i]!), JSON.stringify(entered)).toBe(n + 1);
    }
  }
  expect(await tabsAt(extension, 'https://ab.example/')).toBe(1);
});

test('a row opens what was shown after the document changed, and records no use of a mapping it no longer holds', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'gm https://gm.example/\ngmail https://mail.example/\n' });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const shown = await bar.type('gm');
  expect(shown.suggestions.map(({ content }) => content)).toEqual(['gmail']);
  // Another window's change; the record stays.
  await extension.worker.evaluate(() => chrome.storage.local.set({ mappings: 'gm https://gm.example/new\ngmail https://mail.example/new\n' }));

  await bar.enter('gmail', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, 'https://mail.example/')).toBe(1);
  await bar.enter('gm', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, 'https://gm.example/')).toBe(1);
  expect(await usageOf(extension)).toBeUndefined();
  expect(await tabsAt(extension, 'https://mail.example/new')).toBe(0);
});

test('Enter after the worker was stopped and started again opens the row shown before, from the stored record', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'gm https://gm.example/\ngmail https://mail.example/\ngmx https://gmx.example/\n' });
  const requests = await extension.openRequestPage();
  const bar = addressBar(extension.worker, requests);
  const shown = await bar.type('gm');
  expect(shown.suggestions.map(({ content }) => content)).toEqual(['gmail', 'gmx']);
  // Changed since the list was shown, so only the record can open what it showed.
  await extension.worker.evaluate(() => chrome.storage.local.set({ mappings: 'gm https://gm.example/new\ngmail https://mail.example/new\ngmx https://gmx.example/new\n' }));

  await restartWorker(extension.context, extension.worker, () => requests.send(NOTHING));
  await bar.enter('gmx', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, 'https://gmx.example/')).toBe(1);
  await bar.enter('gm', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, 'https://gm.example/')).toBe(1);
  for (const url of ['https://mail.example/', 'https://gm.example/new', 'https://gmx.example/new']) expect(await tabsAt(extension, url), url).toBe(0);
});

test('text that is neither the listed text nor a row opens row 1 of its own list, and nothing when that is empty', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'gmail https://mail.example/\ngmx https://gmx.example/\n' });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  expect((await bar.type('zz')).suggestions).toEqual([]);
  expect((await recordOf(extension))?.rows).toEqual([]);

  await bar.enter('gmail', 'newForegroundTab');
  await expect.poll(() => tabsAt(extension, 'https://mail.example/')).toBe(1);
  const tabs = await extension.tabUrls();
  await bar.enter('qqq', 'newForegroundTab');
  expect(await extension.tabUrls()).toEqual(tabs);
});

test("Enter opens in the tab Chrome's disposition asks for: the front tab, a new active tab, or a new tab behind", async ({ extension, site }) => {
  const url = site.pageUrl('Mail');
  await extension.seedStorage({ mappings: `mail                 ${url}\n` });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const front = await extension.context.newPage();
  await front.goto(site.pageUrl('In front'));
  await bar.type('mail');
  // Every tab's id, and the active one's, as the worker sees them.
  const tabIds = () =>
    extension.worker.evaluate(async () => {
      const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return { all: (await chrome.tabs.query({})).map((tab) => tab.id!), active: active?.id };
    });
  // Runs `action` and returns the one tab it opened, once at `url`, and the active tab's id after it.
  const opening = async (action: () => Promise<void>) => {
    const before = new Set((await tabIds()).all);
    const opened = extension.context.waitForEvent('page');
    await action();
    await expect(await opened).toHaveURL(url);
    const after = await tabIds();
    const created = after.all.filter((id) => !before.has(id));
    expect(created).toHaveLength(1);
    return { created: created[0], active: after.active };
  };

  const { id: frontId } = await extension.frontTab(front);
  const pages = extension.context.pages().length;
  extension.expectExtensionRequest(url);
  await bar.enter('mail', 'currentTab');
  await expect(front).toHaveURL(url);
  expect(extension.context.pages()).toHaveLength(pages);
  expect((await tabIds()).active).toBe(frontId);

  const foreground = await opening(() => bar.enter('mail', 'newForegroundTab'));
  expect(foreground.active).toBe(foreground.created);

  await extension.frontTab(front);
  const background = await opening(() => bar.enter('mail', 'newBackgroundTab'));
  expect(background.active).toBe(frontId);
  expect((await usageOf(extension))![`mail\n${url}`]).toHaveLength(3);
});

test('Enter in the front tab opens there, though another tab comes to the front while the worker is still busy', async ({ extension, site }) => {
  const url = site.pageUrl('Mail');
  await extension.seedStorage({ mappings: `mail                 ${url}\n` });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const typedIn = await extension.context.newPage();
  await typedIn.goto(site.pageUrl('Where Enter is pressed'));
  const other = await extension.context.newPage();
  const otherUrl = site.pageUrl('Brought to the front after Enter');
  await other.goto(otherUrl);
  await extension.frontTab(typedIn);
  await bar.type('mail');
  // The worker reads the list's record for a second, as a queue of earlier inputs would keep it waiting.
  await slowWorkerReads(extension.worker, 'omnibox', 1_000);
  extension.expectExtensionRequest(url);
  const entered = bar.enter('mail', 'currentTab');
  await new Promise((resolve) => setTimeout(resolve, 150));
  await extension.frontTab(other);
  await entered;
  await expect(typedIn).toHaveURL(url);
  await expect(other).toHaveURL(otherUrl);
});

for (const disposition of ['newForegroundTab', 'newBackgroundTab'] as const) {
  test(`Enter for ${disposition} opens the tab in the window Enter was pressed in, though another window takes the focus while the worker is busy`, async ({ extension, site }) => {
    const url = site.pageUrl('Mail');
    await extension.seedStorage({ mappings: `mail                 ${url}\n` });
    const bar = addressBar(extension.worker, await extension.openRequestPage());
    const typedIn = await extension.context.newPage();
    await typedIn.goto(site.pageUrl('Where Enter is pressed'));
    const { windowId } = await extension.frontTab(typedIn);
    const opened = extension.context.waitForEvent('page');
    const other = (await extension.worker.evaluate((url) => chrome.windows.create({ url, focused: false }), site.pageUrl('In another window')))!;
    const otherPage = await opened;
    await otherPage.waitForLoadState();
    expect((await extension.frontTab(typedIn)).windowId).toBe(windowId);
    await bar.type('mail');
    const tabIds = () => extension.worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => ({ id: tab.id!, windowId: tab.windowId })));
    const before = new Set((await tabIds()).map(({ id }) => id));
    // The worker reads the list's record for a second, as a queue of earlier inputs would keep it waiting.
    await slowWorkerReads(extension.worker, 'omnibox', 1_000);
    const entered = bar.enter('mail', disposition);
    await new Promise((resolve) => setTimeout(resolve, 150));
    // Headless, bringing a page to the front leaves the focused window as it was: its window is focused first.
    await extension.worker.evaluate((id) => chrome.windows.update(id, { focused: true }), other.id!);
    expect((await extension.frontTab(otherPage)).windowId).toBe(other.id);
    await entered;
    await expect.poll(() => tabsAt(extension, url)).toBe(1);
    expect((await tabIds()).filter(({ id }) => !before.has(id)).map((tab) => tab.windowId)).toEqual([windowId]);
  });
}

test('an alias with 500 %s filled by a long argument keeps a small record, and its content still opens the filled URL', async ({ extension }) => {
  const url = `https://big.example/?${'p=%s&'.repeat(500)}`;
  await extension.seedStorage({ mappings: `big                  ${url}\n` });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const argument = 'a'.repeat(2_000);
  await bar.type(`big ${argument}`);
  const filled = url.replaceAll('%s', argument);
  expect(filled.length).toBeGreaterThan(1_000_000);
  expect(JSON.stringify(await recordOf(extension)).length).toBeLessThan(6_000);

  await bar.enter(filled, 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, filled)).toBe(1);
});

test('an address-bar Enter and a popup jump sent together both open and both record their use', async ({ extension }) => {
  await extension.seedStorage({ mappings: 'gmail https://mail.example/\ngmx https://gmx.example/\n' });
  const requests = await extension.openRequestPage();
  const bar = addressBar(extension.worker, requests);
  await bar.type('gmail');
  const [, reply] = await Promise.all([
    bar.enter('gmail', 'newBackgroundTab'),
    requests.send({ kind: 'jump', name: 'gmx', url: 'https://gmx.example/', argument: null, mode: 'new-tab', active: false }),
  ]);
  expect(reply).toEqual({ kind: 'opened' });
  await expect.poll(() => tabsAt(extension, 'https://mail.example/')).toBe(1);
  await expect.poll(() => tabsAt(extension, 'https://gmx.example/')).toBe(1);
  expect(Object.keys((await usageOf(extension))!).sort()).toEqual(['gmail\nhttps://mail.example/', 'gmx\nhttps://gmx.example/']);
});

test('a page named with Alt+Shift+N opens from the address bar in the tab in front', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail                 https://mail.example.com/\n' });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const page = await grantedPage(extension, site, 'Stock prices');
  const popup = await extension.popupByCommand('name-this-page', page);
  await popup.keyboard.type('stocks');
  await popup.keyboard.press('Enter');
  await expect(popup.getByRole('status')).toHaveText('Saved "stocks" as line 2');
  await checkFitAndAccessibility(popup);
  await popup.close();

  const other = await extension.context.newPage();
  await other.goto(site.pageUrl('Another page'));
  const shown = await bar.type('stocks');
  expect(shown.suggestions).toEqual([]);
  expect(shown.defaultDescription).toContain(page.url());
  extension.expectExtensionRequest(page.url());
  await other.bringToFront();
  await bar.enter('stocks', 'currentTab');
  await expect(other).toHaveURL(page.url());
});

test("a list Chrome refuses to store shows only its default, leaves no older record to answer for it, and the next input works", async ({ extension }) => {
  await extension.seedStorage({ mappings: 'gm https://gm.example/\ngmail https://mail.example/\n' });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  await extension.worker.evaluate(() => {
    const seen: string[] = [];
    (globalThis as Record<string, unknown>).unhandledRejections = seen;
    addEventListener('unhandledrejection', (event) => seen.push(String((event as PromiseRejectionEvent).reason)));
  });
  await bar.type('gmail');
  await extension.fillStorage(10);

  const refused = await bar.type('gm');
  expect(refused.suggestions).toEqual([]);
  expect(refused.defaultDescription).toContain('https://gm.example/');
  expect('omnibox' in (await extension.readStorage())).toBe(false);

  await extension.worker.evaluate(() => chrome.storage.local.remove('storageFiller'));
  const next = await bar.type('gm');
  expect(next.suggestions.map(({ content }) => content)).toEqual(['gmail']);
  expect((await recordOf(extension))?.typed).toBe('gm');
  expect(await extension.worker.evaluate(() => (globalThis as Record<string, unknown>).unhandledRejections)).toEqual([]);
});

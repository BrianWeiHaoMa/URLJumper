// Unmatched Enter in the address-bar keyword `uj` (F8, G28): one search, through Chrome's configured default
// search engine, for the text after the keyword, in the tab Chrome's disposition selects and in the window
// Enter was pressed in. The engines are real site searches Chrome's settings stores at local addresses, so a
// hardcoded provider cannot pass. Blank input still opens nothing, and a stored no-match stays a search when
// the document changes.
import {
  addressBar,
  expect,
  makeDefaultSearchEngine,
  slowWorkerReads,
  test,
  type LoadedExtension,
} from './extension.ts';

type Usage = Record<string, number[]>;
type StoredRecord = { typed: string; rows: [number, string, string, string][]; argumentRow: number | null };

const NO_MATCH_DESCRIPTION = 'No URLJumper mapping matches — Enter searches your default search engine';

const usageOf = async (extension: LoadedExtension) => (await extension.readStorage()).usage as Usage | undefined;
const recordOf = async (extension: LoadedExtension) => (await extension.readStorage()).omnibox as StoredRecord | undefined;
const tabsAt = async (extension: LoadedExtension, url: string) => (await extension.tabUrls()).filter((tabUrl) => tabUrl === url).length;
const tabStates = (extension: LoadedExtension) =>
  extension.worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => ({ id: tab.id!, windowId: tab.windowId })));
const activeInWindow = (extension: LoadedExtension, windowId: number) =>
  extension.worker.evaluate(async (windowId) => (await chrome.tabs.query({ active: true, windowId }))[0]?.id, windowId);

test('unmatched Enter searches the configured engine in the tab the disposition asks for, changing neither mappings nor usage', async ({ extension, site }) => {
  const engine = await makeDefaultSearchEngine(extension.context, {
    name: 'Local engine for dispositions',
    url: `${site.pageUrl('Local engine for dispositions')}?q=%s`,
  });
  const mappings = 'gm                   https://gm.example/\n';
  const usage = { 'gm\nhttps://gm.example/': [Date.now() - 1_000] };
  await extension.seedStorage({ mappings, usage });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const front = await extension.context.newPage();
  await front.goto(site.pageUrl('In front'));
  const { id: frontId, windowId } = await extension.frontTab(front);

  for (const [text, disposition] of [
    ["no match: café & 'tea' %s", 'currentTab'],
    ['no match in a foreground tab', 'newForegroundTab'],
    ['no match in a background tab', 'newBackgroundTab'],
  ] as const) {
    const shown = await bar.type(text);
    expect(shown.suggestions).toEqual([]);
    await extension.frontTab(front);
    const before = await tabStates(extension);
    await bar.enter(text, disposition);
    await expect.poll(() => tabsAt(extension, engine.urlFor(text))).toBe(1);
    expect(shown.defaultDescription).toBe(NO_MATCH_DESCRIPTION);
    const created = (await tabStates(extension)).filter(({ id }) => !before.some((tab) => tab.id === id));
    if (disposition === 'currentTab') {
      expect(created).toEqual([]);
      await expect(front).toHaveURL(engine.urlFor(text));
    } else {
      expect(created).toHaveLength(1);
    }
    const active = disposition === 'newForegroundTab' ? created[0]?.id : frontId;
    expect(await activeInWindow(extension, windowId!)).toBe(active);
  }

  const stored = await extension.readStorage();
  expect(stored.mappings).toBe(mappings);
  expect(stored.usage).toEqual(usage);
});

test('blank input after the keyword stays inactive in every disposition', async ({ extension, site }) => {
  const engine = await makeDefaultSearchEngine(extension.context, {
    name: 'Local engine for blank input',
    url: `${site.pageUrl('Local engine for blank input')}?q=%s`,
  });
  const mappings = 'gm                   https://gm.example/\n';
  await extension.seedStorage({ mappings });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const front = await extension.context.newPage();
  await front.goto(site.pageUrl('In front'));
  const { id: frontId, windowId } = await extension.frontTab(front);
  const tabs = await extension.tabUrls();
  const pages = extension.context.pages().length;

  for (const text of ['', '   ']) {
    const shown = await bar.type(text);
    expect(shown.suggestions).toEqual([]);
    expect(shown.defaultDescription).toBe('Type the name of a URLJumper mapping');
    for (const disposition of ['currentTab', 'newForegroundTab', 'newBackgroundTab'] as const) await bar.enter(text, disposition);
  }
  // A blank Enter is blank even when the stored list says the text before it matched nothing.
  await bar.type('no match at all');
  await bar.enter('', 'newForegroundTab');
  await bar.enter('   ', 'newBackgroundTab');

  expect(await extension.tabUrls()).toEqual(tabs);
  expect(extension.context.pages()).toHaveLength(pages);
  expect(await activeInWindow(extension, windowId!)).toBe(frontId);
  expect(await tabsAt(extension, engine.urlFor('no match at all'))).toBe(0);
  expect(await usageOf(extension)).toBeUndefined();
  expect((await extension.readStorage()).mappings).toBe(mappings);
});

test('a stored no-match still searches after the document gains a matching mapping, and a fresh list then opens it', async ({ extension, site }) => {
  const engine = await makeDefaultSearchEngine(extension.context, {
    name: 'Local engine for a stored no-match',
    url: `${site.pageUrl('Local engine for a stored no-match')}?q=%s`,
  });
  const mappings = 'gm                   https://gm.example/\n';
  await extension.seedStorage({ mappings });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const front = await extension.context.newPage();
  await front.goto(site.pageUrl('In front'));
  await extension.frontTab(front);

  const shown = await bar.type('zzz');
  expect(shown.suggestions).toEqual([]);
  expect((await recordOf(extension))?.typed).toBe('zzz');
  expect((await recordOf(extension))?.rows).toEqual([]);
  const tabs = await extension.tabUrls();

  const changed = `${mappings}zzz                  https://zzz.example/\n`;
  await extension.worker.evaluate((mappings) => chrome.storage.local.set({ mappings }), changed);
  expect((await recordOf(extension))?.typed).toBe('zzz');
  expect(await extension.tabUrls()).toEqual(tabs);

  await bar.enter('zzz', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, engine.urlFor('zzz'))).toBe(1);
  expect(await tabsAt(extension, 'https://zzz.example/')).toBe(0);
  expect(await usageOf(extension)).toBeUndefined();
  expect((await extension.readStorage()).mappings).toBe(changed);

  const fresh = await bar.type('zzz');
  expect(fresh.suggestions).toEqual([]);
  await bar.enter('zzz', 'newBackgroundTab');
  await expect.poll(() => tabsAt(extension, 'https://zzz.example/')).toBe(1);
  expect(Object.keys((await usageOf(extension))!)).toEqual(['zzz\nhttps://zzz.example/']);
});

test('unmatched Enter follows the default engine when it changes, and searches nothing before Enter', async ({ extension, site }) => {
  const first = await makeDefaultSearchEngine(extension.context, {
    name: 'Local engine before the change',
    url: `${site.pageUrl('Local engine before the change')}?q=%s`,
  });
  await extension.seedStorage({ mappings: 'gm                   https://gm.example/\n' });
  const bar = addressBar(extension.worker, await extension.openRequestPage());
  const front = await extension.context.newPage();
  await front.goto(site.pageUrl('In front'));
  await extension.frontTab(front);

  const before = await extension.tabUrls();
  const firstShown = await bar.type('first query');
  expect(firstShown.suggestions).toEqual([]);
  expect(await extension.tabUrls()).toEqual(before);
  await bar.enter('first query', 'newForegroundTab');
  await expect.poll(() => tabsAt(extension, first.urlFor('first query'))).toBe(1);

  const second = await makeDefaultSearchEngine(extension.context, {
    name: 'Local engine after the change',
    url: `${site.pageUrl('Local engine after the change')}?q=%s`,
  });
  await extension.frontTab(front);
  const secondShown = await bar.type('second query');
  expect(secondShown.suggestions).toEqual([]);
  await bar.enter('second query', 'newForegroundTab');
  await expect.poll(() => tabsAt(extension, second.urlFor('second query'))).toBe(1);
  expect(await tabsAt(extension, first.urlFor('second query'))).toBe(0);
  expect(await usageOf(extension)).toBeUndefined();
});

for (const disposition of ['newForegroundTab', 'newBackgroundTab'] as const) {
  test(`a search for ${disposition} opens in the window Enter was pressed in, though another window takes the focus`, async ({ extension, site }) => {
    const engine = await makeDefaultSearchEngine(extension.context, {
      name: 'Local engine for an invocation window',
      url: `${site.pageUrl('Local engine for an invocation window')}?q=%s`,
    });
    await extension.seedStorage({ mappings: 'gm                   https://gm.example/\n' });
    const bar = addressBar(extension.worker, await extension.openRequestPage());
    const typedIn = await extension.context.newPage();
    await typedIn.goto(site.pageUrl('Where Enter is pressed'));
    const { id: typedInId, windowId } = await extension.frontTab(typedIn);
    const otherOpened = extension.context.waitForEvent('page');
    const otherWindow = (await extension.worker.evaluate((url) => chrome.windows.create({ url, focused: false }), site.pageUrl('Another window')))!;
    const otherPage = await otherOpened;
    await otherPage.waitForLoadState();
    expect((await extension.frontTab(typedIn)).windowId).toBe(windowId);

    await bar.type('no such mapping');
    // The worker reads the list's record for a second, as a queue of earlier inputs would keep it waiting.
    await slowWorkerReads(extension.worker, 'omnibox', 1_000);
    const before = new Set((await tabStates(extension)).map(({ id }) => id));
    const entered = bar.enter('no such mapping', disposition);
    await new Promise((resolve) => setTimeout(resolve, 150));
    // Headless, bringing a page to the front leaves the focused window as it was: its window is focused first.
    await extension.worker.evaluate((id) => chrome.windows.update(id, { focused: true }), otherWindow.id!);
    expect((await extension.frontTab(otherPage)).windowId).toBe(otherWindow.id);
    await entered;

    await expect.poll(() => tabsAt(extension, engine.urlFor('no such mapping'))).toBe(1);
    const created = (await tabStates(extension)).filter(({ id }) => !before.has(id));
    expect(created).toHaveLength(1);
    expect(created[0]!.windowId).toBe(windowId!);
    expect(await activeInWindow(extension, windowId!)).toBe(disposition === 'newForegroundTab' ? created[0]!.id : typedInId);
  });
}

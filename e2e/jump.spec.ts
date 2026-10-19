import type { JumpRequest } from '../src/requests.ts';
import { expect, test, type LoadedExtension } from './extension.ts';

const newTab = (name: string, url: string, argument: string | null = null): JumpRequest => ({
  kind: 'jump',
  name,
  url,
  argument,
  mode: 'new-tab',
  active: true,
});

// The open tabs but the extension's own pages, such as the one requests are sent from.
async function pageTabs(extension: LoadedExtension) {
  return (await extension.tabUrls()).filter((url) => !url.startsWith(extension.url('')));
}

// Sends `request` and returns its reply and the one tab it opened, outside the extension's own pages.
async function jumpToNewTab(extension: LoadedExtension, request: JumpRequest) {
  const before = new Set(extension.context.pages());
  const reply = await extension.sendRequest(request);
  const opened = () => extension.context.pages().filter((page) => !before.has(page) && !page.url().startsWith(extension.url('')));
  await expect.poll(() => opened().length).toBe(1);
  return { reply, tab: opened()[0]! };
}

test('a jump records one use under the mapping key, then opens its URL in a new active tab', async ({ extension, site }) => {
  const pageA = site.pageUrl('Page A');
  await extension.seedStorage({ mappings: `alpha                ${pageA}\n` });
  const before = Date.now();
  const { reply, tab } = await jumpToNewTab(extension, newTab('alpha', pageA));
  const after = Date.now();

  expect(reply).toEqual({ kind: 'opened' });
  await expect(tab).toHaveURL(pageA);
  expect(await tab.evaluate(() => document.visibilityState)).toBe('visible');
  const { usage } = await extension.readStorage();
  expect(Object.keys(usage as object)).toEqual([`alpha\n${pageA}`]);
  const [time, ...more] = (usage as Record<string, number[]>)[`alpha\n${pageA}`]!;
  expect(more).toEqual([]);
  expect(time).toBeGreaterThanOrEqual(before);
  expect(time).toBeLessThanOrEqual(after);
});

test('the use is keyed by the lowercased name and the URL, as the list keys the mapping', async ({ extension, site }) => {
  const page = site.pageUrl('A repository');
  await extension.seedStorage({ mappings: `GitHub  ${page}\n` });
  expect(await extension.sendRequest(newTab('GitHub', page))).toEqual({ kind: 'opened' });
  expect(Object.keys((await extension.readStorage()).usage as object)).toEqual([`github\n${page}`]);
});

test('a mapping keeps the times of its last ten uses, newest last', async ({ extension, site }) => {
  const page = site.pageUrl('Often');
  const tab = await extension.context.newPage();
  await tab.goto(site.pageUrl('Where the jumps land'));
  const { id: tabId } = await extension.frontTab(tab);
  await extension.seedStorage({ mappings: `often  ${page}\n` });
  extension.expectExtensionRequest(page);

  // Each jump's time lies between the moments before it was sent and after its reply.
  const spans: [number, number][] = [];
  for (let i = 0; i < 11; i++) {
    const before = Date.now();
    // Chrome refuses a navigation the same as one the tab is still loading, so each jump's page loads before the next.
    const loaded = tab.waitForEvent('load');
    expect(await extension.sendRequest({ kind: 'jump', name: 'often', url: page, argument: null, mode: 'this-tab', tabId: tabId! })).toEqual({ kind: 'opened' });
    spans.push([before, Date.now()]);
    await loaded;
    await tab.waitForTimeout(5);
  }
  const times = ((await extension.readStorage()).usage as Record<string, number[]>)[`often\n${page}`]!;
  expect(times).toHaveLength(10);
  times.forEach((time, i) => {
    const [before, after] = spans[i + 1]!;
    expect(time).toBeGreaterThanOrEqual(before);
    expect(time).toBeLessThanOrEqual(after);
  });
});

test('a jump for a mapping the document no longer holds still opens, and records nothing', async ({ extension, site }) => {
  const gone = site.pageUrl('Removed since the list was read');
  const usage = { [`kept\n${site.pageUrl('Kept')}`]: [1_700_000_000_000, 1_700_000_000_001] };
  await extension.seedStorage({ mappings: `kept  ${site.pageUrl('Kept')}\n`, usage });
  expect(await extension.sendRequest(newTab('gone', gone))).toEqual({ kind: 'opened' });
  await expect.poll(() => extension.tabUrls()).toContain(gone);
  expect((await extension.readStorage()).usage).toEqual(usage);
});

test('two jumps sent together both open and both are recorded', async ({ extension, site }) => {
  const page = site.pageUrl('Twice');
  await extension.seedStorage({ mappings: `twice  ${page}\n` });
  const replies = await Promise.all([extension.sendRequest(newTab('twice', page)), extension.sendRequest(newTab('twice', page))]);
  expect(replies).toEqual([{ kind: 'opened' }, { kind: 'opened' }]);
  await expect.poll(async () => (await extension.tabUrls()).filter((url) => url === page)).toHaveLength(2);
  expect(((await extension.readStorage()).usage as Record<string, number[]>)[`twice\n${page}`]).toHaveLength(2);
});

test('a This tab jump navigates the given tab and creates none; a closed tab fails with Chrome\'s message', async ({ extension, site }) => {
  const target = site.pageUrl('Arrived here');
  await extension.seedStorage({ mappings: `here  ${target}\n` });
  const tab = await extension.context.newPage();
  await tab.goto(site.pageUrl('Before the jump'));
  const { id: tabId } = await extension.frontTab(tab);
  const tabsBefore = (await pageTabs(extension)).length;
  extension.expectExtensionRequest(target);

  expect(await extension.sendRequest({ kind: 'jump', name: 'here', url: target, argument: null, mode: 'this-tab', tabId: tabId! })).toEqual({ kind: 'opened' });
  await expect(tab).toHaveURL(target);
  expect(await pageTabs(extension)).toHaveLength(tabsBefore);

  await tab.close();
  expect(await extension.sendRequest({ kind: 'jump', name: 'here', url: target, argument: null, mode: 'this-tab', tabId: tabId! })).toEqual({
    kind: 'failed',
    message: `No tab with id: ${tabId}.`,
  });
});

test('every %s is filled with the encoded argument or removed without one; any other URL opens as written', async ({ extension, site }) => {
  const origin = new URL(site.pageUrl('Unused')).origin;
  const alias = `${origin}/s?a=%s&b=%s`;
  const plain = `${origin}/a%20b`;
  await extension.seedStorage({ mappings: `q  ${alias}\np  ${plain}\n` });

  expect(await extension.sendRequest(newTab('q', alias, 'x y/é'))).toEqual({ kind: 'opened' });
  await expect.poll(() => extension.tabUrls()).toContain(`${origin}/s?a=x%20y%2F%C3%A9&b=x%20y%2F%C3%A9`);
  expect(await extension.sendRequest(newTab('q', alias))).toEqual({ kind: 'opened' });
  await expect.poll(() => extension.tabUrls()).toContain(`${origin}/s?a=&b=`);
  expect(await extension.sendRequest(newTab('p', plain))).toEqual({ kind: 'opened' });
  await expect.poll(() => extension.tabUrls()).toContain(plain);
  // Each jump of a held mapping was a use, the alias's under its URL as written.
  expect(Object.keys((await extension.readStorage()).usage as object).sort()).toEqual([`p\n${plain}`, `q\n${alias}`]);
});

test("a navigation Chrome refuses fails with Chrome's message and opens no tab, the use already recorded", async ({ extension }) => {
  await extension.seedStorage({ mappings: 'crash  chrome://crash/\n' });
  const tabsBefore = await pageTabs(extension);
  expect(await extension.sendRequest(newTab('crash', 'chrome://crash/'))).toEqual({
    kind: 'failed',
    message: "I'm sorry. I'm afraid I can't do that.",
  });
  expect(await pageTabs(extension)).toEqual(tabsBefore);
  // The use is recorded before the navigation is asked for.
  expect(((await extension.readStorage()).usage as Record<string, number[]>)['crash\nchrome://crash/']).toHaveLength(1);
});

test("a use Chrome refuses to store fails with Chrome's message, and nothing opens", async ({ extension, site }) => {
  const page = site.pageUrl('Never opened');
  await extension.seedStorage({ mappings: `full  ${page}\n` });
  await extension.fillStorage(16);
  const tabsBefore = await pageTabs(extension);

  expect(await extension.sendRequest(newTab('full', page))).toEqual({ kind: 'storage-failed', message: 'Resource::kQuotaBytes quota exceeded' });
  expect(await pageTabs(extension)).toEqual(tabsBefore);
  expect('usage' in (await extension.readStorage())).toBe(false);
});

test('an outside address is opened and reported, while its host never resolves', async ({ extension }) => {
  const outside = 'https://example.com/outside';
  await extension.seedStorage({ mappings: `out  ${outside}\n` });
  const { reply, tab } = await jumpToNewTab(extension, newTab('out', outside));
  expect(reply).toEqual({ kind: 'opened' });
  await expect.poll(() => extension.tabUrls()).toContain(outside);
  await expect(tab).toHaveURL('chrome-error://chromewebdata/');
});

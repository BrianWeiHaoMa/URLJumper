import { expect, test } from './extension.ts';

// What 1.x leaves in storage: its document as saved (here from a CRLF file, with aligned columns, a comment
// heading, a trailing comment, a blank line, a tab, a line that is not a mapping, and a repeated name) and
// its theme. It had no search order.
const ONE_X = {
  mappings:
    '\\ Work\r\n' +
    'mail                 https://mail.example.com/\r\n' +
    'docs\thttps://docs.example.com/          \\ team docs\r\n' +
    '\r\n' +
    'not a mapping\r\n' +
    'MAIL                 https://other.example.com/\r\n',
  themePref: 'dark',
};

// A listener that would write runs within milliseconds of its dispatch; this waits long past it.
const settle = () => new Promise((resolve) => setTimeout(resolve, 1_000));

test('a new install stores Smart order and nothing else', async ({ extension }) => {
  expect(await extension.readStorage()).toEqual({ searchOrder: 'smart' });
  await settle();
  expect(await extension.readStorage()).toEqual({ searchOrder: 'smart' });
});

test("a check's seed replaces the install's state, and no install write arrives after it", async ({ extension }) => {
  await extension.seedStorage(ONE_X);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  expect(await extension.readStorage()).toEqual(ONE_X);
});

test('an update from 1.x marks the notice pending and leaves every key 1.x stored byte for byte', async ({ extension }) => {
  for (const previousVersion of ['1.3.0', '1.0', '0.9.1.2']) {
    await extension.seedStorage(ONE_X);
    await extension.dispatchEvent('runtime.onInstalled', { reason: 'update', previousVersion });
    await expect.poll(() => extension.readStorage()).toEqual({ ...ONE_X, upgradeNotice: 'pending' });
    await settle();
    expect(await extension.readStorage(), `from ${previousVersion}`).toEqual({ ...ONE_X, upgradeNotice: 'pending' });
  }
});

test('an update from 2.0.0 or later, a Chrome update, and a shared module update write nothing', async ({ extension }) => {
  await extension.seedStorage(ONE_X);
  const changes = await extension.watchStorage();
  for (const previousVersion of ['2.0.0', '2.0.1', '10.0']) {
    await extension.dispatchEvent('runtime.onInstalled', { reason: 'update', previousVersion });
  }
  await extension.dispatchEvent('runtime.onInstalled', { reason: 'chrome_update' });
  await extension.dispatchEvent('runtime.onInstalled', { reason: 'shared_module_update', id: 'a'.repeat(32) });
  await settle();
  expect(await changes()).toEqual([]);
  expect(await extension.readStorage()).toEqual(ONE_X);
});

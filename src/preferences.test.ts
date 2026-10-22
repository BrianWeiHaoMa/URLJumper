import { afterEach, expect, test, vi } from 'vitest';
import { readPopupSettingsView, readSearchOrder, readTheme, storePopupSettingsView, storeSearchOrder, storeTheme } from './preferences';

test('only `smart` is Smart order; absence and anything else is Document order', () => {
  expect(readSearchOrder('smart')).toBe('smart');
  for (const value of [undefined, 'document', 'Smart', null, 1]) expect(readSearchOrder(value)).toBe('document');
});

test('`light` and `dark` are themes; absence and anything else is System', () => {
  expect(readTheme('light')).toBe('light');
  expect(readTheme('dark')).toBe('dark');
  for (const value of [undefined, 'system', 'Dark', null]) expect(readTheme(value)).toBe('system');
});

test('`list` and `text` are views the popup\'s settings open on; absence and anything else is Preferences', () => {
  expect(readPopupSettingsView('list')).toBe('list');
  expect(readPopupSettingsView('text')).toBe('text');
  for (const value of [undefined, 'preferences', 'List', 'options', null, 1]) expect(readPopupSettingsView(value)).toBe('preferences');
});

// Chrome's storage, replaced: the calls the writes make, and what each call answers.
function chromeStorage(answer: () => Promise<void> = async () => undefined) {
  const calls: [string, unknown][] = [];
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        set: (items: unknown) => (calls.push(['set', items]), answer()),
        remove: (keys: unknown) => (calls.push(['remove', keys]), answer()),
      },
    },
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('the order chosen is stored as `document` or `smart`, each a value the read gives back', async () => {
  const calls = chromeStorage();
  await storeSearchOrder('smart');
  await storeSearchOrder('document');
  expect(calls).toEqual([
    ['set', { searchOrder: 'smart' }],
    ['set', { searchOrder: 'document' }],
  ]);
  expect(readSearchOrder('document')).toBe('document');
});

test('Light and Dark are stored as `light` and `dark`; System removes the key and never stores `system`', async () => {
  const calls = chromeStorage();
  await storeTheme('light');
  await storeTheme('dark');
  await storeTheme('system');
  expect(calls).toEqual([
    ['set', { themePref: 'light' }],
    ['set', { themePref: 'dark' }],
    ['remove', 'themePref'],
  ]);
});

test('List and Text are stored as `list` and `text`, each a value the read gives back; Preferences removes the key', async () => {
  const calls = chromeStorage();
  await storePopupSettingsView('list');
  await storePopupSettingsView('text');
  await storePopupSettingsView('preferences');
  expect(calls).toEqual([
    ['set', { popupSettingsView: 'list' }],
    ['set', { popupSettingsView: 'text' }],
    ['remove', 'popupSettingsView'],
  ]);
  for (const view of ['list', 'text'] as const) expect(readPopupSettingsView(view)).toBe(view);
});

test("a write Chrome refuses rejects with Chrome's error", async () => {
  chromeStorage(() => Promise.reject(new Error('Resource::kQuotaBytes quota exceeded')));
  await expect(storeTheme('dark')).rejects.toThrow('Resource::kQuotaBytes quota exceeded');
  await expect(storeSearchOrder('smart')).rejects.toThrow('Resource::kQuotaBytes quota exceeded');
  await expect(storePopupSettingsView('list')).rejects.toThrow('Resource::kQuotaBytes quota exceeded');
});

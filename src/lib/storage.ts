export type ThemePref = 'light' | 'dark';
export type NavMode = 'new' | 'same';

export const STORAGE_KEYS = {
  mappings: 'mappings',
  themePref: 'themePref',
  pendingMode: 'pendingMode',
} as const;

async function getLocal<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function setLocal(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export const storage = {
  async getMappings(): Promise<string> {
    return (await getLocal<string>(STORAGE_KEYS.mappings)) ?? '';
  },

  async setMappings(text: string): Promise<void> {
    await setLocal(STORAGE_KEYS.mappings, text);
  },

  async getThemePref(): Promise<ThemePref | undefined> {
    return await getLocal<ThemePref>(STORAGE_KEYS.themePref);
  },

  async setThemePref(pref: ThemePref): Promise<void> {
    await setLocal(STORAGE_KEYS.themePref, pref);
  },

  async takePendingMode(): Promise<NavMode | undefined> {
    const result = await chrome.storage.session.get(STORAGE_KEYS.pendingMode);
    const mode = result[STORAGE_KEYS.pendingMode] as NavMode | undefined;
    if (mode !== undefined) {
      await chrome.storage.session.remove(STORAGE_KEYS.pendingMode);
    }
    return mode;
  },

  async setPendingMode(mode: NavMode): Promise<void> {
    await chrome.storage.session.set({ [STORAGE_KEYS.pendingMode]: mode });
  },
};

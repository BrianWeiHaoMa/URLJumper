import { defineManifest } from '@crxjs/vite-plugin';

// The shipped manifest. `permissions`, `commands`, and `omnibox` change only with the product
// specification (F5 to F8): a renamed command drops every shortcut a user reassigned to it.
export default defineManifest({
  manifest_version: 3,
  name: 'URLJumper',
  version: '2.3.0',
  minimum_chrome_version: '127',
  description: 'Open web pages by names you keep in one text document. Type a name, press Enter, arrive.',
  // Drawn by scripts/icons.ts.
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  action: {
    default_popup: 'popup.html',
    default_title: 'URLJumper',
  },
  // The full settings page, in a tab of its own (G31).
  options_ui: { page: 'options.html', open_in_tab: true },
  background: {
    service_worker: 'src/service-worker/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'activeTab', 'clipboardWrite', 'contextMenus', 'search'],
  commands: {
    'open-new-tab': {
      suggested_key: { default: 'Alt+N', mac: 'Alt+N' },
      description: 'Open URLJumper; Enter opens in a new tab',
    },
    'open-same-tab': {
      suggested_key: { default: 'Alt+M', mac: 'Alt+M' },
      description: 'Open URLJumper; Enter opens in this tab',
    },
    'name-this-page': {
      suggested_key: { default: 'Alt+Shift+N', mac: 'Alt+Shift+N' },
      description: 'Name this page in URLJumper',
    },
  },
  // Not a single letter: Chrome lets an extension's keyword override a site search the user made with the same one (F6).
  omnibox: { keyword: 'uj' },
  content_security_policy: { extension_pages: "default-src 'self'" },
});

import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'URL Jumper',
  version: '1.3.0',
  description:
    'Navigate the web with your own aliases instead of URLs. Type a name, press Enter, jump.',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'URL Jumper',
  },
  options_page: 'src/settings/index.html',
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  permissions: ['storage', 'commands', 'activeTab', 'clipboardWrite'],
  commands: {
    'open-new-tab': {
      suggested_key: {
        default: 'Alt+N',
        mac: 'Alt+N',
      },
      description: 'Open URL Jumper popup; Enter navigates in a new tab',
    },
    'open-same-tab': {
      suggested_key: {
        default: 'Alt+M',
        mac: 'Alt+M',
      },
      description: 'Open URL Jumper popup; Enter navigates in the current tab',
    },
  },
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
});

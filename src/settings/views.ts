// The settings views both hosts offer, in the order they list them; the first is the one a host opens on
// (G31) unless the options page's fragment or, for the popup's settings, Preferences names another. A new
// view is a file beside this one and one entry here; for the popup's settings to open on it, its id joins
// `PopupSettingsView` in `src/preferences.ts` and the choice in Preferences.
import { ListView } from './ListView';
import { Preferences } from './Preferences';
import type { SettingsView } from './settings-view';
import { TextView } from './TextView';

/** The view a host shows a line in when the List view asks for it. */
export const TEXT_VIEW: SettingsView = { id: 'text', title: 'Text', View: TextView };

export const SETTINGS_VIEWS: readonly [SettingsView, ...SettingsView[]] = [
  { id: 'preferences', title: 'Preferences', View: Preferences },
  { id: 'list', title: 'List', View: ListView },
  TEXT_VIEW,
];

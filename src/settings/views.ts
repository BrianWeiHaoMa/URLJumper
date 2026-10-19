// The settings views both hosts offer, in the order they list them; the first is the one a host opens on
// (G31). A new view is a file beside this one and one entry here.
import { ListView } from './ListView';
import { Preferences } from './Preferences';
import type { SettingsView } from './settings-view';
import { TextView } from './TextView';

/** The view a host shows Import's file in, and a line the List view asks for. */
export const TEXT_VIEW: SettingsView = { id: 'text', title: 'Text', View: TextView };

export const SETTINGS_VIEWS: readonly [SettingsView, ...SettingsView[]] = [
  { id: 'preferences', title: 'Preferences', View: Preferences },
  { id: 'list', title: 'List', View: ListView },
  TEXT_VIEW,
];

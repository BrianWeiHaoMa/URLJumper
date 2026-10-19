// The settings views both hosts offer, in the order they list them; the first is the one a host opens on
// (G31). A new view is a file beside this one and one entry here.
import { Preferences } from './Preferences';
import type { SettingsView } from './settings-view';

export const SETTINGS_VIEWS: readonly [SettingsView, ...SettingsView[]] = [{ id: 'preferences', title: 'Preferences', View: Preferences }];

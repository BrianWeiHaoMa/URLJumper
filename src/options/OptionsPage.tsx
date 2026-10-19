// The full settings page, `options.html`, which Chrome opens in a tab of its own (G31; Composition, "Settings
// views"): the same settings views as the popup's, listed from the one list, opened on the view its fragment
// names (read once, as the page opens) with the Text view's caret on the line it names, and with Export beside
// Preferences, which the popup's settings do not offer. It shows the stored theme live, as the popup does. It
// holds none of the views' logic.
import { useEffect, useState, type ReactNode } from 'react';
import { followStoredTheme } from '../preferences';
import { Export } from '../settings/Export';
import { lineInFragment, viewInFragment, type SettingsView } from '../settings/settings-view';
import { SettingsNav } from '../settings/SettingsNav';
import { SETTINGS_VIEWS } from '../settings/views';

/** What this page puts beside a view, by the view's id: Import and Export sit beside Preferences here alone. */
const BESIDE: Readonly<Record<string, ReactNode>> = { preferences: <Export /> };

export function OptionsPage() {
  const [shown, setShown] = useState<SettingsView>(() => viewInFragment(location.hash, SETTINGS_VIEWS));
  // The fragment's line is for the view the page opens on, as it opens: showing another view drops it.
  const [caretLine, setCaretLine] = useState(() => lineInFragment(location.hash));
  useEffect(followStoredTheme, []);
  const show = (view: SettingsView) => {
    if (view !== shown) setCaretLine(undefined);
    setShown(view);
  };
  const { View } = shown;

  return (
    <main className="options-page">
      <header className="options-header">
        <h1 className="options-title">URLJumper settings</h1>
        <SettingsNav views={SETTINGS_VIEWS} shown={shown} onShow={show} />
      </header>
      <section className="options-view" aria-label={shown.title}>
        <View beside={BESIDE[shown.id]} caretLine={caretLine} />
      </section>
    </main>
  );
}

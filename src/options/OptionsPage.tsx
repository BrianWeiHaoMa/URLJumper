// The full settings page, `options.html`, which Chrome opens in a tab of its own (G31; Composition, "Settings
// views"): the same settings views as the popup's, listed from the one list, opened on the view its fragment
// names (read once, as the page opens) with the Text view's caret on the line it names, and with Import and
// Export beside Preferences, which the popup's settings do not offer; Import's file it shows in the Text view,
// and the Text view on a line when the List view asks.
// It shows the stored theme live, as the popup does. It holds none of the views' logic.
import { useEffect, useState, type ReactNode } from 'react';
import { followStoredTheme } from '../preferences';
import { Export } from '../settings/Export';
import { Import } from '../settings/Import';
import { lineInFragment, viewInFragment, type ImportedText, type SettingsView } from '../settings/settings-view';
import { SettingsNav } from '../settings/SettingsNav';
import { SETTINGS_VIEWS, TEXT_VIEW } from '../settings/views';

export function OptionsPage() {
  const [shown, setShown] = useState<SettingsView>(() => viewInFragment(location.hash, SETTINGS_VIEWS));
  // The fragment's line is for the view the page opens on, as it opens: showing another view drops it.
  const [caretLine, setCaretLine] = useState(() => lineInFragment(location.hash));
  // Import's file, for the Text view it opens: showing another view drops it, so it is taken once.
  const [imported, setImported] = useState<ImportedText>();
  // Each Import shows the Text view afresh, even one already shown, so a file read late still arrives.
  const [imports, setImports] = useState(0);
  useEffect(followStoredTheme, []);
  const show = (view: SettingsView) => {
    if (view !== shown) {
      setCaretLine(undefined);
      setImported(undefined);
    }
    setShown(view);
  };
  const showTextView = (line: number) => {
    setCaretLine(line);
    setImported(undefined);
    setShown(TEXT_VIEW);
  };
  const importText = (text: ImportedText) => {
    setCaretLine(undefined);
    setImported(text);
    setImports((count) => count + 1);
    setShown(TEXT_VIEW);
  };
  /** What this page puts beside a view, by the view's id: Import and Export sit beside Preferences here alone. */
  const beside: Readonly<Record<string, ReactNode>> = {
    preferences: (
      <>
        <Import onImport={importText} />
        <Export />
      </>
    ),
  };
  const { View } = shown;

  return (
    <main className="options-page">
      <header className="options-header">
        <h1 className="options-title">URLJumper settings</h1>
        <SettingsNav views={SETTINGS_VIEWS} shown={shown} onShow={show} />
      </header>
      <section className="options-view" aria-label={shown.title}>
        <View key={`${shown.id} ${imports}`} beside={beside[shown.id]} caretLine={caretLine} showTextView={showTextView} imported={imported} />
      </section>
    </main>
  );
}

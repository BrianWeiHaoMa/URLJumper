// The full settings page, `options.html`, which Chrome opens in a tab of its own (G31; Composition, "Settings
// views"): the same settings views as the popup's, listed from the one list, opened on the view its fragment
// names (read once, as the page opens) with the Text view's caret on the line it names, and with Import and
// Export beside Preferences, which the popup's settings do not offer; Import's file it shows in the Text view,
// and the Text view on a line when the List view asks; the view shown may ask before another is shown in its place.
// Its header holds the title, then the list of views with, at their end, the view's own controls (the List view's
// *Add mapping*). It shows the stored theme live, as the popup does. It holds none of the views' logic.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { followStoredTheme } from '../preferences';
import { Export } from '../settings/Export';
import { Import } from '../settings/Import';
import { lineInFragment, viewInFragment, type ImportedText, type SettingsView, type SwitchGuard } from '../settings/settings-view';
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
  // Where in the header the view shown puts its own controls, once drawn.
  const [viewControls, setViewControls] = useState<HTMLElement | null>(null);
  // What the view shown asks before another is shown in its place, as it registered it (G19).
  const switchGuard = useRef<SwitchGuard | null>(null);
  const guardSwitch = useCallback((guard: SwitchGuard | null) => {
    switchGuard.current = guard;
  }, []);
  // A switch the view asked about goes as the user answers, and the answer's control goes with the view: the
  // focus, left on nothing, goes to the shown view's button in the list (G32).
  const switched = useRef(false);
  useLayoutEffect(() => {
    if (!switched.current) return;
    switched.current = false;
    if (document.activeElement === document.body) document.querySelector<HTMLElement>('.settings-nav [aria-current="page"]')?.focus();
  }, [shown]);
  useEffect(followStoredTheme, []);
  const show = (view: SettingsView) => {
    if (view === shown) return;
    const proceed = () => {
      switched.current = true;
      setCaretLine(undefined);
      setImported(undefined);
      setShown(view);
    };
    if (switchGuard.current === null) proceed();
    else switchGuard.current.switching(view, proceed);
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
        <div className="options-bar">
          <SettingsNav views={SETTINGS_VIEWS} shown={shown} onShow={show} />
          <span className="options-view-controls" ref={setViewControls} />
        </div>
      </header>
      <section className="options-view" aria-label={shown.title}>
        <View
          key={`${shown.id} ${imports}`}
          beside={beside[shown.id]}
          headerControls={viewControls}
          caretLine={caretLine}
          showTextView={showTextView}
          imported={imported}
          guardSwitch={guardSwitch}
        />
      </section>
    </main>
  );
}

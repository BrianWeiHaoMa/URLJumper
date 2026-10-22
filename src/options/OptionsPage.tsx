// The full settings page, `options.html`, which Chrome opens in a tab of its own (G31; Composition, "Settings
// views"): the same settings views as the popup's, listed from the one list, opened on the view its fragment
// names (read once, as the page opens) with the Text view's caret on the line it names; it shows the Text view on
// a line when the List view asks; the view shown may ask before another is shown in its place.
// Its header holds the title, then the list of views with, at their end, the view's own controls (the List view's
// *Add mapping*, the Text view's *Import…* and *Export…*). It shows the stored theme live, as the popup does. It
// holds none of the views' logic.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { followStoredTheme } from '../preferences';
import { lineInFragment, viewInFragment, type SettingsView, type SwitchGuard } from '../settings/settings-view';
import { SettingsNav } from '../settings/SettingsNav';
import { SETTINGS_VIEWS, TEXT_VIEW } from '../settings/views';

export function OptionsPage() {
  const [shown, setShown] = useState<SettingsView>(() => viewInFragment(location.hash, SETTINGS_VIEWS));
  // The fragment's line is for the view the page opens on, as it opens: showing another view drops it.
  const [caretLine, setCaretLine] = useState(() => lineInFragment(location.hash));
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
      setShown(view);
    };
    if (switchGuard.current === null) proceed();
    else switchGuard.current.switching(view, proceed);
  };
  const showTextView = (line: number) => {
    setCaretLine(line);
    setShown(TEXT_VIEW);
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
        <View headerControls={viewControls} caretLine={caretLine} showTextView={showTextView} guardSwitch={guardSwitch} />
      </section>
    </main>
  );
}

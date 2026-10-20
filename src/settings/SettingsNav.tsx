// The list of settings views a host offers (G31), one button each, the one shown marked as current; both hosts
// draw it from SETTINGS_VIEWS, so a view added there is offered in both.
import type { SettingsView } from './settings-view';
import './settings.css';

interface SettingsNavProps {
  views: readonly SettingsView[];
  shown: SettingsView;
  onShow(view: SettingsView): void;
  /** Called with the view whose button gains the focus, and with null as it loses it. */
  onFocusView?(view: SettingsView | null): void;
}

export function SettingsNav({ views, shown, onShow, onFocusView }: SettingsNavProps) {
  return (
    <nav className="settings-nav" aria-label="Settings views">
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          className="settings-nav-view"
          aria-current={view === shown ? 'page' : undefined}
          onClick={() => onShow(view)}
          onFocus={() => onFocusView?.(view)}
          onBlur={() => onFocusView?.(null)}
        >
          {view.title}
        </button>
      ))}
    </nav>
  );
}

/** What Enter does on `view`'s button in the list (L2), given whether the view shown may ask first (`SwitchGuard`). */
export function enterOnView(view: SettingsView, shown: SettingsView, mayAsk: boolean): string {
  if (view === shown) return `Enter does nothing · ${view.title} is shown`;
  return mayAsk ? `Enter shows ${view.title}, first asking about any unsaved text` : `Enter shows ${view.title}`;
}

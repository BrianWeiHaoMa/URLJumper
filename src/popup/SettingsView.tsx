import { MappingsEditor } from '../settings/MappingsEditor';

type Props = {
  onBack: () => void;
  onToggleTheme: () => void;
};

export function SettingsView({ onBack, onToggleTheme }: Props) {
  const handleOpenInTab = () => {
    if (chrome?.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  };

  return (
    <div className="app">
      <div className="row">
        <button onClick={onBack}>
          &larr; Back
        </button>
        <span className="spacer" />
        <button
          onClick={handleOpenInTab}
          title="Open Settings on its own page."
        >
          Open in Tab
        </button>
        <button onClick={onToggleTheme} title="Toggle light/dark theme.">
          Toggle Theme
        </button>
      </div>
      <MappingsEditor showCopyUrl />
    </div>
  );
}

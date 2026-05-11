import { ExtensionFrame } from '../ExtensionFrame';
import { useTheme } from '../lib/theme';
import { MappingsEditor } from './MappingsEditor';

export function SettingsPage() {
  const { toggle } = useTheme();
  return (
    <ExtensionFrame title="URL Jumper Settings">
      <div className="app">
        <div className="row row-end">
          <button onClick={toggle} title="Toggle light/dark theme.">
            Toggle Theme
          </button>
        </div>
        <MappingsEditor rows={30} />
      </div>
    </ExtensionFrame>
  );
}

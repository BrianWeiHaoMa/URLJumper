import { useEffect, useState } from 'react';
import { ExtensionFrame } from '../ExtensionFrame';
import { PopupView } from './PopupView';
import { SettingsView } from './SettingsView';
import { useTheme } from '../lib/theme';
import { storage, type NavMode } from '../lib/storage';

type View = 'popup' | 'settings';

export function App() {
  const { toggle } = useTheme();
  const [view, setView] = useState<View>('popup');
  const [mode, setMode] = useState<NavMode>('new');
  const [modeReady, setModeReady] = useState(false);

  useEffect(() => {
    storage.takePendingMode().then((pending) => {
      setMode(pending ?? 'new');
      setModeReady(true);
    });
  }, []);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      window.close();
    };
    document.addEventListener('keydown', onEscape, true);
    return () => document.removeEventListener('keydown', onEscape, true);
  }, []);

  if (!modeReady) {
    return (
      <ExtensionFrame title="URL Jumper">
        <div className="app" />
      </ExtensionFrame>
    );
  }

  if (view === 'settings') {
    return (
      <ExtensionFrame title="URL Jumper Settings">
        <SettingsView onBack={() => setView('popup')} onToggleTheme={toggle} />
      </ExtensionFrame>
    );
  }

  return (
    <ExtensionFrame title="URL Jumper">
      <PopupView mode={mode} onOpenSettings={() => setView('settings')} />
    </ExtensionFrame>
  );
}

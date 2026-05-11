import { useEffect, useRef, useState } from 'react';
import {
  MappingsEditor,
  type MappingsEditorHandle,
} from '../settings/MappingsEditor';

type Props = {
  onBack: () => void;
  onToggleTheme: () => void;
};

export function SettingsView({ onBack, onToggleTheme }: Props) {
  const mappingsEditorRef = useRef<MappingsEditorHandle>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'ok'; message: string }
    | { kind: 'err'; message: string }
  >({ kind: 'idle' });

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopyUrl = async () => {
    let didCopy = false;
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const url = tab?.url;
      if (url) {
        await navigator.clipboard.writeText(url);
        didCopy = true;
        setCopyStatus({ kind: 'ok', message: 'Copied URL to clipboard.' });
      } else {
        console.warn('Current URL could not be retrieved.');
        setCopyStatus({ kind: 'err', message: 'Could not copy URL.' });  
      }
    } catch (err) {
      console.warn('navigator.clipboard.writeText() failed:', err);
      setCopyStatus({ kind: 'err', message: 'Could not copy URL.' });
    } finally {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopyStatus({ kind: 'idle' });
        copyTimerRef.current = null;
      }, 2000);
    }
    if (didCopy) {
      mappingsEditorRef.current?.focusForNewMappingLine();
    }
  };

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
          type="button"
          onClick={handleCopyUrl}
          title="Copy current tab's URL."
        >
          Copy URL
        </button>
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
      {copyStatus.kind !== 'idle' && (
        <div
          className={`banner ${copyStatus.kind === 'ok' ? 'success' : 'error'}`}
          role={copyStatus.kind === 'ok' ? 'status' : 'alert'}
        >
          {copyStatus.message}
        </div>
      )}
      <MappingsEditor ref={mappingsEditorRef} />
    </div>
  );
}

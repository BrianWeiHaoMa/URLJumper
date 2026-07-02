import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type { ParseError } from '../lib/parser';
import { lineStartOffset, parseMappings } from '../lib/parser';
import { storage } from '../lib/storage';

declare global {
  interface Window {
    showSaveFilePicker: (options: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  }
}

const PLACEHOLDER = `\\ This is an example.
\\ Use \\ to write comments.
\\ Here are some example mappings:
search        https://google.com \\ This is a comment and will be ignored.
stocks        https://ca.finance.yahoo.com/portfolios
stocks-news   https://seekingalpha.com/market-news
benefits      https://www.manulife.ca/personal.html
server        http://192.168.1.251:8989/ 
`;

const EXPORT_FILENAME = 'URLJumperMappings.txt';

function isCaretAtLineStart(value: string, offset: number): boolean {
  return offset === 0 || value[offset - 1] === '\n';
}

type Status =
  | { kind: 'idle' }
  | { kind: 'errors'; errors: ParseError[] }
  | { kind: 'saved' };

type Props = {
  rows?: number;
  showCopyUrl?: boolean;
  focusLine?: number | null;
};

type CopyState = 'idle' | 'ok' | 'err';

export type MappingsEditorHandle = {
  focusForNewMappingLine: () => void;
};

export const MappingsEditor = forwardRef<
  MappingsEditorHandle,
  Props
>(function MappingsEditor({ rows = 16, showCopyUrl = false, focusLine = null }, ref) {
  const [text, setText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const savedTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusedLineRef = useRef<number | null>(null);
  const textareaFocusedBeforeRef = useRef(false);

  const focusMappingLine = useCallback((line: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = lineStartOffset(el.value, line);
    el.focus();
    el.setSelectionRange(start, start);
    const style = window.getComputedStyle(el);
    const parsedLineHeight = Number.parseFloat(style.lineHeight);
    const lineHeight = Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
      ? parsedLineHeight
      : 16;
    el.scrollTop = Math.max(0, (line - 1) * lineHeight - el.clientHeight / 2);
    el.scrollLeft = 0;
  }, []);

  // Restore left padding when caret moves to line start.
  const restoreLineStartPadding = useCallback(() => {
    const el = textareaRef.current;
    if (!el || el.selectionStart !== el.selectionEnd) return;

    const offset = el.selectionStart;
    if (!isCaretAtLineStart(el.value, offset)) return;

    // Deferred to the next animation frame because the browser performs its
    // caret-driven horizontal auto-scroll after the event handler returns;
    // resetting scrollLeft synchronously would be clobbered by that scroll.
    // Worked without this in testing but it is a safety net.
    window.requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (
        current &&
        current.selectionStart === offset &&
        current.selectionEnd === offset &&
        isCaretAtLineStart(current.value, offset)
      ) {
        current.scrollLeft = 0;
      }
    });
  }, []);

  const focusForNewMappingLine = () => {
    flushSync(() => {
      setText((prev) => {
        if (prev.length === 0) return prev;
        if (prev.endsWith('\n')) return prev;
        return `${prev}\n`;
      });
    });
    const el = textareaRef.current;
    if (!el) return;
    const len = el.value.length;
    el.focus();
    el.setSelectionRange(len, len);
    el.scrollTop = el.scrollHeight;
  };

  useImperativeHandle(ref, () => ({
    focusForNewMappingLine,
  }));

  useEffect(() => {
    storage.getMappings().then((stored) => {
      setText(stored);
      setOriginalText(stored);
      setLoaded(true);
    });
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!loaded || focusLine == null || focusedLineRef.current === focusLine) return;
    focusedLineRef.current = focusLine;
    focusMappingLine(focusLine);
  }, [loaded, focusLine, focusMappingLine]);

  const dirty = loaded && text !== originalText;

  const handleSave = async () => {
    const result = parseMappings(text);
    if (result.errors.length > 0) {
      setStatus({ kind: 'errors', errors: result.errors });
      return;
    }
    await storage.setMappings(text);
    setOriginalText(text);
    setStatus({ kind: 'saved' });
    if (savedTimerRef.current !== null) {
      window.clearTimeout(savedTimerRef.current);
    }
    savedTimerRef.current = window.setTimeout(() => {
      setStatus({ kind: 'idle' });
      savedTimerRef.current = null;
    }, 2000);
  };

  const flashCopyState = (next: Exclude<CopyState, 'idle'>) => {
    setCopyState(next);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopyState('idle');
      copyTimerRef.current = null;
    }, 2000);
  };

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
        flashCopyState('ok');
      } else {
        console.warn('Current URL could not be retrieved.');
        flashCopyState('err');
      }
    } catch (err) {
      console.warn('navigator.clipboard.writeText() failed:', err);
      flashCopyState('err');
    }
    if (didCopy && !textareaFocusedBeforeRef.current) {
      focusForNewMappingLine();
    }
  };

  const handleExport = async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: EXPORT_FILENAME,
        types: [
          {
            description: 'Text files',
            accept: { 'text/plain': ['.txt'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('Export failed:', err);
      }
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const content = await file.text();
    setText(content);
    if (status.kind !== 'idle') setStatus({ kind: 'idle' });
  };

  return (
    <>
      <textarea
        ref={textareaRef}
        className="mappings-editor-textarea"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (status.kind !== 'idle') setStatus({ kind: 'idle' });
        }}
        onKeyUp={restoreLineStartPadding}
        onMouseUp={restoreLineStartPadding}
        onSelect={restoreLineStartPadding}
        onFocus={() => {
          textareaFocusedBeforeRef.current = true;
        }}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        rows={rows}
        aria-label="URL mappings"
      />

      <div className="row">
        <div className="row">
          <button className="primary" onClick={handleSave}>
            Save Changes
          </button>
          {dirty && <span className="muted">Unsaved Changes</span>}
        </div>
        <span className="spacer" aria-hidden />
        <div className="row">
          {showCopyUrl && (
            <button
              type="button"
              onClick={handleCopyUrl}
              title="Copy current tab's URL."
            >
              {copyState === 'ok'
                ? 'Copied!'
                : copyState === 'err'
                  ? 'Copy Failed!'
                  : 'Copy URL'}
            </button>
          )}
          <button onClick={handleExport} title="Download mappings.">
            Export
          </button>
          <button onClick={handleImportClick} title="Import mappings.">
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
      </div>

      {status.kind === 'errors' && (
        <div className="banner error" role="alert">
          <strong>
            {status.errors.length === 1
              ? '1 error — save failed'
              : `${status.errors.length} errors — nothing was saved.`}
          </strong>
          <ul>
            {status.errors.map((err, i) => (
              <li key={i}>
                Line {err.line}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status.kind === 'saved' && (
        <div className="banner success" role="status">
          Saved.
        </div>
      )}
    </>
  );
});

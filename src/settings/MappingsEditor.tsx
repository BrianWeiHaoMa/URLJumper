import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type { ParseError } from '../lib/parser';
import { parseMappings } from '../lib/parser';
import { storage } from '../lib/storage';

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

type Status =
  | { kind: 'idle' }
  | { kind: 'errors'; errors: ParseError[] }
  | { kind: 'saved' };

type Props = {
  rows?: number;
};

export type MappingsEditorHandle = {
  focusForNewMappingLine: () => void;
};

export const MappingsEditor = forwardRef<
  MappingsEditorHandle,
  Props
>(function MappingsEditor({ rows = 16 }, ref) {
  const [text, setText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const savedTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focusForNewMappingLine() {
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
    },
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
    };
  }, []);

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

  const handleExport = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = EXPORT_FILENAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          {dirty && <span className="muted">unsaved changes</span>}
        </div>
        <span className="spacer" aria-hidden />
        <div className="row">
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

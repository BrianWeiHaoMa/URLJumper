import { useEffect, useMemo, useRef, useState } from 'react';
import type { Mapping } from '../lib/parser';
import { parseMappings } from '../lib/parser';
import type { NavMode } from '../lib/storage';
import { storage } from '../lib/storage';
import { navigate } from '../lib/navigation';
import { AutocompleteList } from './AutocompleteList';
import {
  initialSuggestionWindow,
  moveDown,
  moveUp,
  selectedMatchIndex,
  visibleIndices,
  type SuggestionWindowState,
} from '../lib/suggestionWindow';

type Props = {
  mode: NavMode;
  onOpenSettings: () => void;
};

export function PopupView({ mode, onOpenSettings }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [windowState, setWindowState] = useState<SuggestionWindowState>(
    initialSuggestionWindow,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const allMatchesRef = useRef<Mapping[]>([]);
  const allowPointerHighlightRef = useRef(true);

  useEffect(() => {
    storage.getMappings().then((text) => {
      const result = parseMappings(text);
      setMappings(result.mappings);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allMatches = useMemo(() => {
    if (query.trim() === '') return [];
    const q = query.toLowerCase();
    return mappings.filter((m) => m.name.toLowerCase().startsWith(q));
  }, [mappings, query]);

  useEffect(() => {
    allowPointerHighlightRef.current = true;
    setWindowState(initialSuggestionWindow);
  }, [query, mappings]);

  const visible = useMemo(() => {
    return visibleIndices(windowState, allMatches.length)
      .map((i) => allMatches[i])
      .filter((m): m is Mapping => m !== undefined);
  }, [allMatches, windowState]);

  allMatchesRef.current = allMatches;

  useEffect(() => {
    const el = suggestionsRef.current;
    if (!el || visible.length === 0) {
      return;
    }

    const onWheel = (e: WheelEvent) => {
      const N = allMatchesRef.current.length;
      if (N === 0) return;
      e.preventDefault();
      e.stopPropagation();
      allowPointerHighlightRef.current = false;
      if (e.deltaY > 0) {
        setWindowState((s) => moveDown(s, N));
      } else if (e.deltaY < 0) {
        setWindowState((s) => moveUp(s, N));
      }
    };

    const wheelOpts: AddEventListenerOptions = { passive: false };
    el.addEventListener('wheel', onWheel, wheelOpts);
    return () => {
      el.removeEventListener('wheel', onWheel, wheelOpts);
    };
  }, [visible.length, allMatches.length]);

  const performNavigate = async (m: Mapping) => {
    try {
      await navigate(m.url, mode);
    } finally {
      window.close();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const N = allMatches.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (N === 0) return;
      allowPointerHighlightRef.current = false;
      setWindowState((s) => moveDown(s, N));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (N === 0) return;
      allowPointerHighlightRef.current = false;
      setWindowState((s) => moveUp(s, N));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (N === 0) return;
      const idx = selectedMatchIndex(windowState, N) ?? 0;
      const target = allMatches[idx] ?? allMatches[0];
      if (target) void performNavigate(target);
    }
  };

  const showEmptyState = loaded && mappings.length === 0;
  const showNoResults =
    loaded && !showEmptyState && query.trim() !== '' && allMatches.length === 0;
  const hiddenAbove = windowState.offset;
  const hiddenBelow = Math.max(
    0,
    allMatches.length - (visible.length + windowState.offset),
  );

  return (
    <div className="app">
      <div className="row">
        <button type="button" onClick={onOpenSettings} title="Edit mappings in Settings.">
          Settings
        </button>
        <span className="spacer" aria-hidden />
        <span
          className="mode-pill"
          title={mode === 'new' ? 'Enter opens in a new tab' : 'Enter opens in the current tab'}
        >
          {mode === 'new' ? 'new tab mode' : 'same tab mode'}
        </span>
      </div>

      {showEmptyState ? (
        <div className="empty-state">
          No URL mappings yet.
          <br />
          Open <b>Settings</b> to add some.
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a name and press ENTER to jump to the corresponding URL."
            spellCheck={false}
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="urljumper-suggestions"
          />

          {visible.length > 0 && (
            <div
              id="urljumper-suggestions"
              ref={suggestionsRef}
              onMouseMove={() => {
                allowPointerHighlightRef.current = true;
              }}
            >
              <AutocompleteList
                suggestions={visible}
                activeIndex={windowState.slotIndex}
                onSelect={performNavigate}
                onHover={(slot) => {
                  if (!allowPointerHighlightRef.current) return;
                  setWindowState((s) => ({ ...s, slotIndex: slot }));
                }}
                hiddenAbove={hiddenAbove}
                hiddenBelow={hiddenBelow}
              />
            </div>
          )}
          {showNoResults && <div className="no-results">No results.</div>}
        </>
      )}
    </div>
  );
}

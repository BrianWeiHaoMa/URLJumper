import { useEffect, useMemo, useRef, useState } from 'react';
import type { Mapping } from '../lib/parser';
import { parseMappings } from '../lib/parser';
import type { NavMode } from '../lib/storage';
import { storage } from '../lib/storage';
import { navigate } from '../lib/navigation';
import { AutocompleteList } from './AutocompleteList';
import {
  rankAutocompleteEntries,
  type RankedAutocompleteEntry,
} from '../lib/autocompleteRank';
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

function suggestionSlotUnderPointer(
  clientX: number,
  clientY: number,
  root: Element | null,
): number | null {
  if (!root) return null;
  const hit = document.elementFromPoint(clientX, clientY);
  if (!hit || !root.contains(hit)) return null;
  const li = hit.closest('[data-urljumper-suggestion-slot]');
  if (!li || !root.contains(li)) return null;
  const raw = li.getAttribute('data-urljumper-suggestion-slot');
  if (raw == null) return null;
  const slot = Number(raw);
  return Number.isFinite(slot) ? slot : null;
}

/** Minimum cumulative pointer travel (px) along the path since the current lock began. */
const POINTER_UNLOCK_DRIFT_PX = 30
/** Ignore the first N mousemoves after lock (avoids synthetic / layout noise). */
const POINTER_UNLOCK_MIN_MOUSEMOVES = 4;

export function PopupView({ mode, onOpenSettings }: Props) {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [windowState, setWindowState] = useState<SuggestionWindowState>(
    initialSuggestionWindow,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const rankedMatchesRef = useRef<RankedAutocompleteEntry[]>([]);
  /** Client position of the last mousemove anywhere in the popup (for desync detection). */
  const lastPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  /** Until wheel on the list or enough deliberate pointer travel, ignore mouse-driven slot changes. */
  const pointerSelectionLockedRef = useRef(true);
  /** Count of `.app` mousemove events since this lock; reset when lock clears. */
  const pointerLockMoveEventsRef = useRef(0);
  /** Sum of Euclidean segment lengths between consecutive mouse positions since this lock. */
  const pointerLockCumulativeDriftRef = useRef(0);
  /** Previous client position for the next segment contribution to cumulative drift. */
  const pointerLockPrevClientRef = useRef<{ x: number; y: number } | null>(null);

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

  const rankedMatches = useMemo(
    () => rankAutocompleteEntries(mappings, query),
    [mappings, query],
  );

  useEffect(() => {
    pointerSelectionLockedRef.current = true;
    pointerLockMoveEventsRef.current = 0;
    pointerLockCumulativeDriftRef.current = 0;
    pointerLockPrevClientRef.current = null;
    lastPointerClientRef.current = null;
    setWindowState(initialSuggestionWindow);
  }, [query, mappings]);

  const visible = useMemo(() => {
    return visibleIndices(windowState, rankedMatches.length)
      .map((i) => rankedMatches[i])
      .filter((row): row is RankedAutocompleteEntry => row !== undefined);
  }, [rankedMatches, windowState]);

  rankedMatchesRef.current = rankedMatches;

  useEffect(() => {
    if (rankedMatches.length === 0 || visible.length === 0) return;

    const last = lastPointerClientRef.current;
    if (last == null) return;

    const root = suggestionsRef.current;
    if (!root) return;

    const under = suggestionSlotUnderPointer(last.x, last.y, root);
    if (under === windowState.slotIndex) return;

    pointerSelectionLockedRef.current = true;
    pointerLockMoveEventsRef.current = 0;
    pointerLockCumulativeDriftRef.current = 0;
    pointerLockPrevClientRef.current = null;
  }, [
    windowState.slotIndex,
    windowState.offset,
    visible.length,
    rankedMatches.length,
  ]);

  useEffect(() => {
    const el = suggestionsRef.current;
    if (!el || visible.length === 0) {
      return;
    }

    const onWheel = (e: WheelEvent) => {
      const N = rankedMatchesRef.current.length;
      if (N === 0) return;
      e.preventDefault();
      e.stopPropagation();
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
  }, [visible.length, rankedMatches.length]);

  const performNavigate = async (m: Mapping) => {
    try {
      await navigate(m.url, mode);
    } finally {
      window.close();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const N = rankedMatches.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (N === 0) return;
      setWindowState((s) => moveDown(s, N));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (N === 0) return;
      setWindowState((s) => moveUp(s, N));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (N === 0) return;
      const idx = selectedMatchIndex(windowState, N) ?? 0;
      const target =
        rankedMatches[idx]?.mapping ?? rankedMatches[0]?.mapping;
      if (target) void performNavigate(target);
    }
  };

  const showEmptyState = loaded && mappings.length === 0;
  const showNoResults =
    loaded && !showEmptyState && query.trim() !== '' && rankedMatches.length === 0;
  const hiddenAbove = windowState.offset;
  const hiddenBelow = Math.max(
    0,
    rankedMatches.length - (visible.length + windowState.offset),
  );

  const onAppMouseMove = (e: React.MouseEvent) => {
    lastPointerClientRef.current = { x: e.clientX, y: e.clientY };

    if (!pointerSelectionLockedRef.current) return;

    const x = e.clientX;
    const y = e.clientY;

    pointerLockMoveEventsRef.current += 1;
    const prev = pointerLockPrevClientRef.current;
    if (prev != null) {
      pointerLockCumulativeDriftRef.current += Math.hypot(x - prev.x, y - prev.y);
    }
    pointerLockPrevClientRef.current = { x, y };

    if (
      pointerLockMoveEventsRef.current < POINTER_UNLOCK_MIN_MOUSEMOVES ||
      pointerLockCumulativeDriftRef.current < POINTER_UNLOCK_DRIFT_PX
    ) {
      return;
    }

    pointerSelectionLockedRef.current = false;
    pointerLockMoveEventsRef.current = 0;
    pointerLockCumulativeDriftRef.current = 0;
    pointerLockPrevClientRef.current = null;

    const slot = suggestionSlotUnderPointer(
      x,
      y,
      suggestionsRef.current,
    );
    if (slot == null) return;
    setWindowState((s) =>
      s.slotIndex === slot ? s : { ...s, slotIndex: slot },
    );
  };

  return (
    <div className="app" onMouseMove={onAppMouseMove}>
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
              setQuery(e.target.value.replace(/^\s+/, ''));
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a name and press Enter to jump to the corresponding URL."
            spellCheck={false}
            autoComplete="off"
            aria-autocomplete="list"
            aria-controls="urljumper-suggestions"
          />

          {visible.length > 0 && (
            <div
              id="urljumper-suggestions"
              ref={suggestionsRef}
              onMouseMove={(e) => {
                if (pointerSelectionLockedRef.current) return;
                const slot = suggestionSlotUnderPointer(
                  e.clientX,
                  e.clientY,
                  suggestionsRef.current,
                );
                if (slot == null) return;
                setWindowState((s) =>
                  s.slotIndex === slot ? s : { ...s, slotIndex: slot },
                );
              }}
            >
              <AutocompleteList
                suggestions={visible}
                activeIndex={windowState.slotIndex}
                onSelect={performNavigate}
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

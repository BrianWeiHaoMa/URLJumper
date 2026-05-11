import { describe, it, expect } from 'vitest';
import {
  initialSuggestionWindow,
  moveDown,
  moveUp,
  visibleIndices,
  selectedMatchIndex,
  VISIBLE_COUNT,
} from './suggestionWindow';

const VC = VISIBLE_COUNT;

describe('suggestionWindow', () => {
  describe('moveDown', () => {
    it('does nothing when there are 0 matches', () => {
      expect(moveDown(initialSuggestionWindow, 0)).toEqual(
        initialSuggestionWindow,
      );
    });

    it('does nothing when there is exactly 1 match', () => {
      expect(moveDown(initialSuggestionWindow, 1)).toEqual(
        initialSuggestionWindow,
      );
    });

    it('moves from slot 0 to slot 1 with multiple matches', () => {
      expect(moveDown(initialSuggestionWindow, 5)).toEqual({
        slotIndex: 1,
        offset: 0,
      });
    });

    it('walks slots 0..N-1 for a list smaller than the visible window', () => {
      let state = initialSuggestionWindow;
      const N = 5;
      const path = [state.slotIndex];
      for (let i = 0; i < 6; i++) {
        state = moveDown(state, N);
        path.push(state.slotIndex);
      }
      expect(path).toEqual([0, 1, 2, 3, 4, 4, 4]);
      expect(state.offset).toBe(0);
    });

    it('walks slots 0..7 for an 8-match list with no scrolling', () => {
      let state = initialSuggestionWindow;
      const N = 8;
      for (let i = 0; i < 7; i++) state = moveDown(state, N);
      expect(state).toEqual({ slotIndex: 7, offset: 0 });
      expect(moveDown(state, N)).toEqual({ slotIndex: 7, offset: 0 });
    });

    it('scrolls window when stepping past slot 7 with 9 matches', () => {
      let state = initialSuggestionWindow;
      const N = 9;
      for (let i = 0; i < 7; i++) state = moveDown(state, N);
      expect(state).toEqual({ slotIndex: 7, offset: 0 });
      state = moveDown(state, N);
      expect(state).toEqual({ slotIndex: 7, offset: 1 });
      expect(moveDown(state, N)).toEqual({ slotIndex: 7, offset: 1 });
    });

    it('keeps scrolling until offset = N - VISIBLE_COUNT then stops', () => {
      let state = initialSuggestionWindow;
      const N = 12;
      for (let i = 0; i < 20; i++) state = moveDown(state, N);
      expect(state).toEqual({ slotIndex: VC - 1, offset: N - VC });
    });
  });

  describe('moveUp', () => {
    it('does nothing at the very top', () => {
      expect(moveUp(initialSuggestionWindow, 5)).toEqual(
        initialSuggestionWindow,
      );
    });

    it('moves from slot 1 (offset 0) back to slot 0', () => {
      expect(moveUp({ slotIndex: 1, offset: 0 }, 5)).toEqual({
        slotIndex: 0,
        offset: 0,
      });
    });

    it('decrements offset when at slot 1 with offset > 0', () => {
      expect(moveUp({ slotIndex: 1, offset: 3 }, 12)).toEqual({
        slotIndex: 1,
        offset: 2,
      });
    });

    it('moves slotIndex when above slot 1', () => {
      expect(moveUp({ slotIndex: 5, offset: 2 }, 12)).toEqual({
        slotIndex: 4,
        offset: 2,
      });
    });

    it('round-trip: down then up returns to the start for a small list', () => {
      const N = 4;
      let state = initialSuggestionWindow;
      for (let i = 0; i < 3; i++) state = moveDown(state, N);
      expect(state).toEqual({ slotIndex: 3, offset: 0 });
      for (let i = 0; i < 3; i++) state = moveUp(state, N);
      expect(state).toEqual(initialSuggestionWindow);
    });

    it('round-trip: scroll down past 8 then back up traverses every match', () => {
      const N = 12;
      let state = initialSuggestionWindow;
      const visited: number[] = [];
      for (let i = 0; i < 11; i++) {
        state = moveDown(state, N);
        visited.push(selectedMatchIndex(state, N)!);
      }
      expect(visited).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      const visitedUp: number[] = [];
      for (let i = 0; i < 11; i++) {
        state = moveUp(state, N);
        visitedUp.push(selectedMatchIndex(state, N)!);
      }
      expect(visitedUp).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    });
  });

  describe('visibleIndices', () => {
    it('returns [] when there are no matches', () => {
      expect(visibleIndices(initialSuggestionWindow, 0)).toEqual([]);
    });

    it('returns all matches when N <= visibleCount', () => {
      expect(visibleIndices(initialSuggestionWindow, 5)).toEqual([
        0, 1, 2, 3, 4,
      ]);
    });

    it('returns the locked first plus a sliding window with offset = 1', () => {
      expect(visibleIndices({ slotIndex: 7, offset: 1 }, 9)).toEqual([
        0, 2, 3, 4, 5, 6, 7, 8,
      ]);
    });

    it('returns the locked first plus a sliding window with offset = 3', () => {
      expect(visibleIndices({ slotIndex: 7, offset: 3 }, 12)).toEqual([
        0, 4, 5, 6, 7, 8, 9, 10,
      ]);
    });
  });

  describe('selectedMatchIndex', () => {
    it('is null when there are no matches', () => {
      expect(selectedMatchIndex(initialSuggestionWindow, 0)).toBeNull();
    });

    it('is 0 when at slot 0', () => {
      expect(selectedMatchIndex({ slotIndex: 0, offset: 5 }, 12)).toBe(0);
    });

    it('is slotIndex + offset for non-zero slots', () => {
      expect(selectedMatchIndex({ slotIndex: 7, offset: 3 }, 12)).toBe(10);
    });
  });
});

export type SuggestionWindowState = {
  slotIndex: number;
  offset: number;
};

export const VISIBLE_COUNT = 8;

export const initialSuggestionWindow: SuggestionWindowState = {
  slotIndex: 0,
  offset: 0,
};

export function moveDown(
  state: SuggestionWindowState,
  totalMatches: number,
): SuggestionWindowState {
  if (totalMatches <= 1) return state;
  const lastSlot = VISIBLE_COUNT - 1;
  const { slotIndex, offset } = state;

  if (slotIndex === 0) {
    return { slotIndex: 1, offset };
  }
  if (slotIndex < lastSlot) {
    if (slotIndex + offset + 1 < totalMatches) {
      return { slotIndex: slotIndex + 1, offset };
    }
    return state;
  }
  if (offset + VISIBLE_COUNT < totalMatches) {
    return { slotIndex, offset: offset + 1 };
  }
  return state;
}

export function moveUp(
  state: SuggestionWindowState,
  totalMatches: number,
): SuggestionWindowState {
  if (totalMatches === 0) return state;
  const { slotIndex, offset } = state;

  if (slotIndex > 1) {
    return { slotIndex: slotIndex - 1, offset };
  }
  if (slotIndex === 1) {
    if (offset > 0) {
      return { slotIndex, offset: offset - 1 };
    }
    return { slotIndex: 0, offset };
  }
  return state;
}

export function visibleIndices(
  state: SuggestionWindowState,
  totalMatches: number,
): number[] {
  if (totalMatches === 0) return [];
  const result: number[] = [0];
  const lastSlot = VISIBLE_COUNT - 1;
  for (let k = 1; k <= lastSlot; k++) {
    const i = k + state.offset;
    if (i >= totalMatches) break;
    result.push(i);
  }
  return result;
}

export function selectedMatchIndex(
  state: SuggestionWindowState,
  totalMatches: number,
): number | null {
  if (totalMatches === 0) return null;
  if (state.slotIndex === 0) return 0;
  const idx = state.slotIndex + state.offset;
  return idx < totalMatches ? idx : null;
}

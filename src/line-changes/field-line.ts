// The line of a single-line field (G7, E1, E8): the room the value's own marks need above and below it, as the
// fonts Chrome has on this platform draw it. Chrome clips a field's text to its inner editor's line, which a
// fixed `line-height` sets, centered on the primary font's ascent and descent whichever fonts draw the value;
// so only the line gives room, never the field's height or padding, and `line-height: normal` clips at the
// fonts' declared metrics, which marks reach past. A field keeps its stylesheet's line, its base, while the
// value's ink stays inside it, raises its own line by whole pixels when the ink reaches past, and stops at
// four times its font size, past which only marks stacked beyond any script's writing reach: G7 lets a field
// cut those, and the popup's header and footer stay whole.
import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Pixels kept beyond the ink on each side, for the baseline's rounding to whole pixels. */
const MARGIN = 1;
/** The highest line, in sizes of the field's font. */
const CAP_IN_FONT_SIZES = 4;

/** How the fonts that draw a value place it, in pixels from its baseline. */
export interface ValueInk {
  /** The primary font's ascent and descent, on which the line is centered. */
  ascent: number;
  descent: number;
  /** How far the value's ink reaches above and below the baseline. */
  above: number;
  below: number;
}

/**
 * The line, in whole pixels, a field needs for `ink`: the primary font's box with as much again above and below
 * as the deeper side's ink and margin reach past it; never below `base`, the stylesheet's line, and otherwise
 * never above four times `fontSize`.
 */
export function fieldLine(ink: ValueInk, base: number, fontSize: number): number {
  const past = Math.max(0, ink.above + MARGIN - ink.ascent, ink.below + MARGIN - ink.descent);
  const needed = Math.ceil(ink.ascent + ink.descent + 2 * past);
  return Math.max(base, Math.min(Math.round(CAP_IN_FONT_SIZES * fontSize), needed));
}

/**
 * Sizes `field`'s line from its value, or its placeholder while empty, whenever the field appears or that text
 * changes: a field can appear already holding a value, as the search box back from an editor. Only the field's
 * inline `line-height` changes, set above the base and cleared at it.
 */
export function useFieldLine(field: RefObject<HTMLInputElement | null>): void {
  const sized = useRef<{ element: HTMLInputElement; text: string } | null>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (element === null) return;
    const text = element.value || element.placeholder;
    if (sized.current?.element === element && sized.current.text === text) return;
    sized.current = { element, text };
    sizeLine(element, text);
  });
}

let pen: CanvasRenderingContext2D | null = null;

function sizeLine(element: HTMLInputElement, text: string): void {
  // The base is the stylesheet's line, read with this rule's own line cleared.
  element.style.lineHeight = '';
  const style = getComputedStyle(element);
  const base = parseFloat(style.lineHeight);
  if (!Number.isFinite(base)) return;
  // A canvas given the field's font draws with the fonts the field falls back to, so it measures the ink the
  // field draws.
  pen ??= document.createElement('canvas').getContext('2d')!;
  pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const measured = pen.measureText(text);
  const ink = { ascent: measured.fontBoundingBoxAscent, descent: measured.fontBoundingBoxDescent, above: measured.actualBoundingBoxAscent, below: measured.actualBoundingBoxDescent };
  const line = fieldLine(ink, base, parseFloat(style.fontSize));
  if (line > base) element.style.lineHeight = `${line}px`;
}

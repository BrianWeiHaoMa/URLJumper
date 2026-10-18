// The fit every popup state is held to (G7), through e2e/extension.ts: the real action popup inside Chrome's
// popup size limit, its header and footer in view, and nothing of its own cut off but a row's name or URL
// longer than the row, shown from its start and cut with an ellipsis.
import { expect, type Page } from '@playwright/test';

/**
 * Fails unless the state `popup` shows, once Chrome has sized the popup to it, fits (G7): the viewport is
 * within Chrome's 800 by 600 limit (S6) and the page does not overflow it; the header and footer are whole in
 * view; no element of the popup's own is cut across or along, or lies where a box that clips it cannot show
 * or scroll to, except a row's name or URL cut with an ellipsis from its start; and a field's line holds its
 * text's height. The view may scroll, which cuts nothing; a field's value scrolls across inside the field.
 */
export async function checkFit(popup: Page): Promise<void> {
  await expect.poll(() => fitProblems(popup), { message: 'the popup does not fit', timeout: 5_000 }).toEqual([]);
}

function fitProblems(popup: Page): Promise<string[]> {
  return popup.evaluate(async () => {
    const problems: string[] = [];
    // A popup.html open in a tab has the tab's viewport, which says nothing about the popup's.
    if ((await chrome.tabs.getCurrent()) !== undefined) return ['this is a popup.html open in a tab, not the action popup'];
    if (innerWidth > 800 || innerHeight > 600) problems.push(`the viewport is ${innerWidth} by ${innerHeight}, beyond Chrome's 800 by 600`);
    const page = document.documentElement;
    if (page.scrollWidth > innerWidth || page.scrollHeight > innerHeight) problems.push(`the page is ${page.scrollWidth} by ${page.scrollHeight} in a ${innerWidth} by ${innerHeight} viewport`);

    const main = document.querySelector('main');
    if (!main) return [...problems, 'the popup shows no main'];
    const described = (element: Element) =>
      `${element.tagName.toLowerCase()}.${[...element.classList].join('.')} "${(element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`;
    // Whether the first character of `element`'s text is drawn inside it: the text is shown from its start.
    const fromStart = (element: Element) => {
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, (node) => (node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)).nextNode();
      if (!text) return true;
      const range = document.createRange();
      range.setStart(text, 0);
      range.setEnd(text, 1);
      const [first, box] = [range.getBoundingClientRect(), element.getBoundingClientRect()];
      return first.left >= box.left - 0.5 && first.right <= box.right + 0.5;
    };
    for (const part of [main.querySelector(':scope > header'), main.querySelector(':scope > footer')]) {
      if (!part) continue;
      const box = part.getBoundingClientRect();
      if (box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth) problems.push(`not whole in view: ${described(part)}`);
    }
    const shortenedText = '.row-name, .row-url, .name-row-name';
    for (const element of [main, ...main.querySelectorAll<HTMLElement>('*')]) {
      // Inside a name or URL a row may cut, the text is that text.
      if (element.parentElement?.closest(shortenedText)) continue;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      // On each axis the nearest box that clips this one, else the viewport, can show it or scroll to it; that
      // box is held to the same against its own.
      let [acrossSeen, alongSeen] = [false, false];
      for (let clipper = element.parentElement; clipper !== null && !(acrossSeen && alongSeen); clipper = clipper.parentElement) {
        const root = clipper === document.documentElement;
        const clips = getComputedStyle(clipper);
        const across = !acrossSeen && (root || clips.overflowX !== 'visible');
        const along = !alongSeen && (root || clips.overflowY !== 'visible');
        if (!across && !along) continue;
        [acrossSeen, alongSeen] = [acrossSeen || across, alongSeen || along];
        const area = clipper.getBoundingClientRect();
        const left = root ? -scrollX : area.left + clipper.clientLeft - clipper.scrollLeft;
        const top = root ? -scrollY : area.top + clipper.clientTop - clipper.scrollTop;
        const outside =
          (across && (box.left < left - 0.5 || box.right > left + clipper.scrollWidth + 0.5)) ||
          (along && (box.top < top - 0.5 || box.bottom > top + clipper.scrollHeight + 0.5));
        if (box.width + box.height > 0 && outside) problems.push(`cut off by ${described(clipper)}: ${described(element)}`);
      }
      if (element instanceof HTMLTextAreaElement) continue;
      if (element instanceof HTMLInputElement) {
        // The field's one line is as tall as its line height, centered in the field, and the text sits on it as
        // the font places it: the field must hold the line, and the line the text's ink above and below.
        const text = element.value || element.placeholder;
        const pen = document.createElement('canvas').getContext('2d')!;
        pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const ink = pen.measureText(text || 'x');
        const [ascent, descent] = [ink.fontBoundingBoxAscent, ink.fontBoundingBoxDescent];
        const line = style.lineHeight === 'normal' ? ascent + descent : parseFloat(style.lineHeight);
        const room = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const leading = (line - ascent - descent) / 2;
        if (room < line - 0.5) problems.push(`field shorter than its line: ${described(element)}`);
        if (text && (ink.actualBoundingBoxAscent > leading + ascent + 0.5 || ink.actualBoundingBoxDescent > leading + descent + 0.5)) {
          problems.push(`text cut along: ${described(element)} "${text.slice(0, 40)}"`);
        }
        continue;
      }
      if (element.scrollWidth > element.clientWidth) {
        const shortened = element.matches(shortenedText) && style.textOverflow === 'ellipsis' && fromStart(element);
        if (!shortened) problems.push(`cut across: ${described(element)}`);
      }
      // A box that scrolls along shows all of it; one that hides or clips it cuts.
      if (['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight) problems.push(`cut along: ${described(element)}`);
    }
    return problems;
  });
}

// The fit every popup state is held to (G7), through e2e/extension.ts: the real action popup inside Chrome's
// popup size limit, its header and footer in view, and nothing of its own cut off but a row's name or URL, or
// a List view row's note, longer than the row, shown from its start and cut with an ellipsis, and the marks a
// text field whose line has reached its cap cuts; and whether a field, a text area at its top or bottom edge, or a
// box such as a List view row at its top or bottom edge, draws its text whole, from its picture.
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Fails unless the state `popup` shows, once Chrome has sized the popup to it, fits (G7): the viewport is
 * within Chrome's 800 by 600 limit (S6) and the page does not overflow it; the header and footer are whole in
 * view; no element of the popup's own is cut across or along, or lies where a box that clips it cannot show
 * or scroll to, except a row's name, URL, or note cut with an ellipsis from its start; and a field's line holds its
 * text's ink, except that a field whose line has reached its cap, four times its font size, may cut marks stacked
 * past any script's writing. The view may scroll, which cuts nothing; a field's value scrolls across inside the field.
 * Headless, Chrome gives the popup at most 510 pixels of height, not the 600 it allows, so a view that would
 * fit in 600, such as the settings, scrolls here.
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
    const shortenedText = '.row-name, .row-url, .name-row-name, .list-name, .list-url, .list-note';
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
        const atCap = line === Math.round(4 * parseFloat(style.fontSize));
        if (room < line - 0.5) problems.push(`field shorter than its line: ${described(element)}`);
        if (text && !atCap && (ink.actualBoundingBoxAscent > leading + ascent + 0.5 || ink.actualBoundingBoxDescent > leading + descent + 0.5)) {
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

/**
 * Whether the single-line field `field` draws its value whole (G7): the field as drawn, its border, background,
 * and focus ring made invisible, against the same field given 27 more pixels of line above and below around the
 * same centre, its place in the layout kept. Each property it sets it clears after, and the field's own line is
 * put back, so the line the product gave the field stays; the field keeps the focus and draws as before.
 */
export async function fieldDrawnWhole(page: Page, field: Locator): Promise<boolean> {
  const element = (await field.elementHandle())!;
  // Where the field is drawn, and in what viewport: Chrome resizes the popup to its content a moment after a
  // field grows, which can move what the pictures show, so a pair counts only if the field stood still, after
  // two frames, and a field is cut only when two such pairs differ.
  const place = () => element.evaluate((input) => `${JSON.stringify(input.getBoundingClientRect())} in ${innerWidth} by ${innerHeight}`);
  let differed = 0;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await element.evaluate(() => new Promise((framed) => requestAnimationFrame(() => requestAnimationFrame(framed))));
    await element.scrollIntoViewIfNeeded();
    const before = await place();
    const clip = await element.evaluate((input: HTMLInputElement) => {
      const style = getComputedStyle(input);
      const box = input.getBoundingClientRect();
      const top = box.top + input.clientTop + parseFloat(style.paddingTop);
      const height = input.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      input.scrollLeft = 0;
      input.style.borderColor = 'transparent';
      input.style.background = 'transparent';
      input.style.outline = 'none';
      // The line with room above and below it, where marks the field cut would show.
      const above = Math.min(20, top);
      const left = box.left + input.clientLeft + parseFloat(style.paddingLeft);
      return { x: left, y: top - above, width: input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), height: height + above + 20 };
    });
    const drawn = await page.screenshot({ clip, caret: 'hide' });
    const own = await element.evaluate((input: HTMLElement) => {
      const style = getComputedStyle(input);
      const line = input.style.lineHeight;
      input.style.marginTop = `${parseFloat(style.marginTop) - 27}px`;
      input.style.marginBottom = `${parseFloat(style.marginBottom) - 27}px`;
      input.style.lineHeight = `${parseFloat(style.lineHeight) + 54}px`;
      return line;
    });
    const roomy = await page.screenshot({ clip, caret: 'hide' });
    await element.evaluate((input: HTMLElement, line) => {
      for (const property of ['border-color', 'background', 'outline', 'margin-top', 'margin-bottom']) input.style.removeProperty(property);
      input.style.lineHeight = line;
    }, own);
    const after = await place();
    if (after !== before) continue;
    if (drawn.equals(roomy)) return true;
    if (++differed === 2) return false;
  }
  throw new Error('the field kept moving while it was pictured');
}

/**
 * Whether the text area `area`, scrolled to its `end`, draws the ink of its line at that edge whole (G7): the strip
 * from 24 pixels inside that edge to 6 past it as drawn, the area's border, background, and focus ring made
 * invisible, against the same strip with the area given 40 more pixels of padding at that edge, as much more
 * height, and 40 fewer pixels of margin there, so nothing moves and the scroll is kept, where ink the edge cut
 * shows. Each property it sets it clears after.
 */
export async function textAreaEdgeDrawnWhole(page: Page, area: Locator, end: 'top' | 'bottom'): Promise<boolean> {
  const element = (await area.elementHandle())!;
  const clip = await element.evaluate((input: HTMLTextAreaElement, end) => {
    input.scrollTop = end === 'top' ? 0 : input.scrollHeight;
    input.style.borderColor = 'transparent';
    input.style.background = 'transparent';
    input.style.outline = 'none';
    const box = input.getBoundingClientRect();
    const edge = box.top + input.clientTop + (end === 'top' ? 0 : input.clientHeight);
    return { x: box.left + input.clientLeft, width: input.clientWidth, y: end === 'top' ? edge - 6 : edge - 24, height: 30 };
  }, end);
  await element.evaluate(() => new Promise((framed) => requestAnimationFrame(() => requestAnimationFrame(framed))));
  const drawn = await page.screenshot({ clip, caret: 'hide' });
  await element.evaluate((input: HTMLTextAreaElement, end) => {
    const style = getComputedStyle(input);
    const scrolled = input.scrollTop;
    const [padding, margin] = end === 'top' ? ['paddingTop', 'marginTop'] as const : ['paddingBottom', 'marginBottom'] as const;
    input.style[padding] = `${parseFloat(style[padding]) + 40}px`;
    input.style[margin] = `${parseFloat(style[margin]) - 40}px`;
    input.style.height = `${parseFloat(style.height) + 40}px`;
    input.scrollTop = scrolled;
  }, end);
  await element.evaluate(() => new Promise((framed) => requestAnimationFrame(() => requestAnimationFrame(framed))));
  const roomy = await page.screenshot({ clip, caret: 'hide' });
  await element.evaluate((input: HTMLTextAreaElement) => {
    for (const property of ['border-color', 'background', 'outline', 'padding-top', 'padding-bottom', 'margin-top', 'margin-bottom', 'height']) input.style.removeProperty(property);
  });
  return drawn.equals(roomy);
}

/**
 * Whether `box`, a block such as a List view row, centred in the view that scrolls it, draws the ink of its text
 * at its `end` whole (G7): the strip from 20 pixels inside that edge to 20 past it as drawn against the same strip
 * with the box given 40 more pixels of padding at that edge and 40 fewer of margin, so nothing moves, where ink
 * the box's edge cut shows. Each property it sets it clears after.
 */
export async function boxEdgeDrawnWhole(page: Page, box: Locator, end: 'top' | 'bottom'): Promise<boolean> {
  const element = (await box.elementHandle())!;
  const frames = () => element.evaluate(() => new Promise((framed) => requestAnimationFrame(() => requestAnimationFrame(framed))));
  await element.evaluate((node: HTMLElement) => node.scrollIntoView({ block: 'center' }));
  await frames();
  const place = () => element.evaluate((node: HTMLElement) => JSON.stringify((node.firstElementChild ?? node).getBoundingClientRect()));
  const before = await place();
  const clip = await element.evaluate((node: HTMLElement, end) => {
    const area = node.getBoundingClientRect();
    return { x: area.left, width: area.width, y: (end === 'top' ? area.top : area.bottom) - 20, height: 40 };
  }, end);
  const drawn = await page.screenshot({ clip, caret: 'hide' });
  await element.evaluate((node: HTMLElement, end) => {
    const style = getComputedStyle(node);
    const [padding, margin] = end === 'top' ? (['paddingTop', 'marginTop'] as const) : (['paddingBottom', 'marginBottom'] as const);
    node.style[padding] = `${parseFloat(style[padding]) + 40}px`;
    node.style[margin] = `${parseFloat(style[margin]) - 40}px`;
  }, end);
  await frames();
  const moved = (await place()) !== before;
  const roomy = await page.screenshot({ clip, caret: 'hide' });
  await element.evaluate((node: HTMLElement) => {
    for (const property of ['padding-top', 'padding-bottom', 'margin-top', 'margin-bottom']) node.style.removeProperty(property);
  });
  await frames();
  if (moved) throw new Error('the box moved while it was pictured');
  return drawn.equals(roomy);
}

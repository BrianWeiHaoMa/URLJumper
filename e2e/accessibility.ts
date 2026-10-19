// The accessibility pass (G32) every popup state runs, through e2e/extension.ts: axe-core's WCAG 2 A and AA
// rules for names and contrast, with 4.5:1 asked of all text, and a Tab walk for visible keyboard focus.
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

/** Text needs this contrast against its rendered background, at any size (G32). */
const TEXT_CONTRAST = 4.5;
const axeSource = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/**
 * The accessibility pass on the state `page` shows now (G32): fails on an interactive element without an
 * accessible name, on text below 4.5:1 against its rendered background, and on a focusable control that
 * Tab never reaches or whose keyboard focus does not visibly change it. Names and contrast are axe-core's
 * WCAG 2 A and AA rules, with text a scrolling view hides judged scrolled into view; focus is walked with Tab
 * and given back where it was.
 */
export async function checkAccessibility(page: Page): Promise<void> {
  const problems = [...(await axeProblems(page)), ...(await focusProblems(page))];
  if (problems.length > 0) throw new Error(`accessibility problems:\n${problems.join('\n')}`);
}

/**
 * `checkAccessibility` with the system's color scheme light, then dark, which is each theme for a page that
 * follows the system. Ends with the scheme no longer emulated.
 */
export async function checkAccessibilityInBothSchemes(page: Page): Promise<void> {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await checkAccessibility(page);
  }
  await page.emulateMedia({ colorScheme: null });
}

async function axeProblems(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(axeSource);
  return page.evaluate(async (needed) => {
    interface Node {
      target: string[];
      failureSummary?: string;
      any: { message: string; data?: { contrastRatio?: number } | null }[];
    }
    interface Result {
      id: string;
      nodes: Node[];
    }
    type Results = Record<'violations' | 'incomplete' | 'passes', Result[]>;
    const axe = (window as unknown as { axe: { run(context: Document | Element, options: object): Promise<Results> } }).axe;
    const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    const where = (node: Node) => node.target.join(' ');
    const contrast = (results: Result[]) => results.filter((result) => result.id === 'color-contrast').flatMap((result) => result.nodes);
    // Text axe cannot judge where it stands, partly or wholly scrolled out of a scrolling view, it judges again
    // scrolled into view, as it is read there; every box is then given back its scroll. Text that stays
    // undecided is reported below.
    const judged = new Map<string, { verdict: keyof Results; node: Node }>();
    for (const verdict of ['violations', 'incomplete', 'passes'] as const) for (const node of contrast(results[verdict])) judged.set(where(node), { verdict, node });
    const undecided = contrast(results.incomplete).map(where);
    if (undecided.length > 0) {
      const scrolls = [...document.querySelectorAll<HTMLElement>('*')].map((box) => [box, box.scrollTop, box.scrollLeft] as const);
      for (const target of undecided) {
        const element = document.querySelector(target);
        if (element === null) continue;
        element.scrollIntoView({ block: 'center', inline: 'nearest' });
        const again = await axe.run(element, { runOnly: { type: 'rule', values: ['color-contrast'] } });
        for (const verdict of ['violations', 'incomplete', 'passes'] as const) for (const node of contrast(again[verdict])) if (where(node) === target) judged.set(target, { verdict, node });
      }
      for (const [box, top, left] of scrolls) {
        box.scrollTop = top;
        box.scrollLeft = left;
      }
    }
    const verdicts = [...judged.values()];
    return [
      ...results.violations.flatMap((result) => result.nodes.map((node) => `${result.id}: ${where(node)}: ${(node.failureSummary ?? '').replace(/\s+/g, ' ')}`)),
      ...verdicts
        .filter(({ verdict, node }) => verdict === 'violations' && !contrast(results.violations).includes(node))
        .map(({ node }) => `color-contrast: ${where(node)}: ${(node.failureSummary ?? '').replace(/\s+/g, ' ')}`),
      // Contrast axe could not decide is not contrast shown to hold.
      ...verdicts
        .filter(({ verdict }) => verdict === 'incomplete')
        .map(({ node }) => `color-contrast undecided: ${where(node)}: ${node.any.map((check) => check.message).join(' ')}`),
      // axe allows 3:1 for large text; G32 asks 4.5:1 of all text.
      ...verdicts
        .filter(({ verdict, node }) => verdict === 'passes' && !((node.any[0]?.data?.contrastRatio ?? 0) >= needed))
        .map(({ node }) => `color-contrast: ${where(node)}: ${node.any[0]?.data?.contrastRatio ?? 'no ratio'}:1 is below ${needed}:1`),
    ];
  }, TEXT_CONTRAST);
}

// Tab walks the controls in order and wraps; each one reached is drawn focused, then with nothing focused.
async function focusProblems(page: Page): Promise<string[]> {
  // Tab into a text field selects its text: the field's selection is given back with the focus. Tab scrolls
  // each control it reaches into view: every scrolled box is given back its scroll, so the page is left as
  // the walk found it, and a pass after this one sees the same state.
  const before = await page.evaluateHandle(() => {
    const element = document.activeElement as HTMLElement | null;
    const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : undefined;
    const scrolled = [...document.querySelectorAll<HTMLElement>('*')]
      .filter((box) => box.scrollTop !== 0 || box.scrollLeft !== 0)
      .map((box) => [box, box.scrollTop, box.scrollLeft] as const);
    return { element, selection: field ? ([field.selectionStart, field.selectionEnd, field.selectionDirection] as const) : undefined, scrolled };
  });
  // Every control Tab can focus, and every control a user acts on, whatever its tabindex: a list's options are
  // the exception, reached with the arrow keys from the control that owns them.
  const controls = await page.evaluateHandle(() =>
    [...document.querySelectorAll<HTMLElement>('*')].filter(
      (element) =>
        (element.tabIndex >= 0 || element.matches('a[href], button, input, select, textarea, summary, [role=button], [role=link], [role=checkbox], [role=switch], [role=tab], [role=menuitem]')) &&
        !element.matches(':disabled') &&
        element.getClientRects().length > 0,
    ),
  );
  const names = await controls.evaluate((controls) => controls.map((control) => `${control.tagName.toLowerCase()} "${control.ariaLabel ?? control.textContent ?? ''}"`));
  const problems: string[] = [];
  const reached = new Set<number>();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let step = 0; step < 2 * names.length + 2 && reached.size < names.length; step++) {
    await page.keyboard.press('Tab');
    const index = await controls.evaluate((controls) => controls.indexOf(document.activeElement as HTMLElement));
    if (index < 0 || reached.has(index)) continue;
    reached.add(index);
    // Tab goes on from the control blurred.
    if (!(await focusDrawn(page))) problems.push(`focus not visible: ${names[index]}`);
  }
  names.forEach((name, index) => {
    if (!reached.has(index)) problems.push(`focus never reached by Tab: ${name}`);
  });
  await before.evaluate(({ element, selection, scrolled }) => {
    element?.focus({ preventScroll: true });
    if (selection) (element as HTMLInputElement).setSelectionRange(selection[0], selection[1], selection[2] ?? undefined);
    for (const box of document.querySelectorAll<HTMLElement>('*')) {
      if (box.scrollTop !== 0) box.scrollTop = 0;
      if (box.scrollLeft !== 0) box.scrollLeft = 0;
    }
    for (const [box, top, left] of scrolled) {
      box.scrollTop = top;
      box.scrollLeft = left;
    }
  });
  return problems;
}

/**
 * Whether the control with the focus is drawn differently from how it is drawn without it, around its box,
 * however the focus got there (G32, "focus is always visible"). Leaves that control blurred.
 */
export async function focusDrawn(page: Page): Promise<boolean> {
  const clip = await page.evaluate(() => {
    const box = document.activeElement!.getBoundingClientRect();
    const x = Math.max(0, box.x - 4);
    const y = Math.max(0, box.y - 4);
    return { x, y, width: Math.min(innerWidth, box.right + 4) - x, height: Math.min(innerHeight, box.bottom + 4) - y };
  });
  const focused = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const unfocused = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  return !focused.equals(unfocused);
}

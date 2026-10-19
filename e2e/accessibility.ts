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
 * WCAG 2 A and AA rules; focus is walked with Tab and given back where it was.
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
    const axe = (window as unknown as { axe: { run(context: Document, options: object): Promise<Record<'violations' | 'incomplete' | 'passes', Result[]>> } }).axe;
    const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    const where = (node: Node) => node.target.join(' ');
    const contrast = (results: Result[]) => results.filter((result) => result.id === 'color-contrast').flatMap((result) => result.nodes);
    return [
      ...results.violations.flatMap((result) => result.nodes.map((node) => `${result.id}: ${where(node)}: ${(node.failureSummary ?? '').replace(/\s+/g, ' ')}`)),
      // Contrast axe could not decide is not contrast shown to hold.
      ...contrast(results.incomplete).map((node) => `color-contrast undecided: ${where(node)}: ${node.any.map((check) => check.message).join(' ')}`),
      // axe allows 3:1 for large text; G32 asks 4.5:1 of all text.
      ...contrast(results.passes)
        .filter((node) => !((node.any[0]?.data?.contrastRatio ?? 0) >= needed))
        .map((node) => `color-contrast: ${where(node)}: ${node.any[0]?.data?.contrastRatio ?? 'no ratio'}:1 is below ${needed}:1`),
    ];
  }, TEXT_CONTRAST);
}

// Tab walks the controls in order and wraps; each one reached is drawn focused, then with nothing focused.
async function focusProblems(page: Page): Promise<string[]> {
  // Tab into a text field selects its text: the field's selection is given back with the focus.
  const before = await page.evaluateHandle(() => {
    const element = document.activeElement as HTMLElement | null;
    const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : undefined;
    return { element, selection: field ? ([field.selectionStart, field.selectionEnd, field.selectionDirection] as const) : undefined };
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
  await before.evaluate(({ element, selection }) => {
    element?.focus();
    if (selection) (element as HTMLInputElement).setSelectionRange(selection[0], selection[1], selection[2] ?? undefined);
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

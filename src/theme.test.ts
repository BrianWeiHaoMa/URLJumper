/// <reference types="vite/client" />
// The theme stylesheet's check (G32, R7): every text token meets 4.5:1 against every background token in
// both themes, every color is a token, and every stylesheet draws text and backgrounds only with tokens of
// that kind, so the pairs checked here are the pairs the pages can render.
import { expect, test } from 'vitest';

const sources = import.meta.glob<string>('./**/*.{css,ts,tsx}', { query: '?raw', import: 'default', eager: true });
const THEME = './theme.css';
const theme = sources[THEME]!;
const stylesheets = Object.entries(sources).filter(([path]) => path.endsWith('.css'));
const productFiles = Object.entries(sources).filter(([path]) => path !== THEME && !/\.test\.tsx?$/.test(path));

/** Text needs this contrast against its background in both themes (G32). */
const TEXT_CONTRAST = 4.5;
/** The focus ring needs this against every background to stay visible (WCAG's non-text contrast). */
const FOCUS_CONTRAST = 3;

interface Token {
  name: string;
  light: string;
  dark: string;
}

/** The color tokens `css` defines, as `--name: light-dark(#light, #dark);`. */
function colorTokens(css: string): Token[] {
  return [...stripComments(css).matchAll(/(--[\w-]+)\s*:\s*light-dark\(\s*(#[0-9a-fA-F]{3,6})\s*,\s*(#[0-9a-fA-F]{3,6})\s*\)/g)].map(
    ([, name, light, dark]) => ({ name: name!, light: light!, dark: dark! }),
  );
}

/** Every pair of a text token and a background token, and of the focus ring and a background token, below its contrast in either theme. */
function contrastFailures(tokens: readonly Token[]): string[] {
  const failures: string[] = [];
  const backgrounds = tokens.filter((token) => token.name.startsWith('--bg-'));
  for (const fore of tokens) {
    const needed = fore.name.startsWith('--text-') ? TEXT_CONTRAST : fore.name === '--focus' ? FOCUS_CONTRAST : undefined;
    if (needed === undefined) continue;
    for (const back of backgrounds) {
      for (const scheme of ['light', 'dark'] as const) {
        const ratio = contrast(fore[scheme], back[scheme]);
        if (ratio < needed) failures.push(`${fore.name} on ${back.name}, ${scheme}: ${ratio.toFixed(2)}:1`);
      }
    }
  }
  return failures;
}

/** Color literals in a file other than the theme stylesheet: hex colors, color functions, and in style code a named color. */
function colorLiterals(path: string, text: string): string[] {
  const found = [...stripComments(text).matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|light-dark)\(/g)].map(([literal]) => literal);
  if (path.endsWith('.css')) found.push(...misusedColors(text));
  // Inline styles in components: no color property at all, since a value there escapes the theme.
  if (path.endsWith('.tsx')) found.push(...[...text.matchAll(/\b(?:color|background\w*|border\w*Color|outlineColor|fill|stroke)\s*:/g)].map(([key]) => key));
  return found;
}

/**
 * In a stylesheet: a color property whose value is anything but tokens of its kind and a few keywords. Text
 * colors take `--text-*` tokens and backgrounds `--bg-*`, so a pair this file did not check cannot be drawn.
 */
function misusedColors(css: string): string[] {
  const misused: string[] = [];
  for (const [, property, value] of stripComments(css).matchAll(/(?:^|[;{\s])([\w-]+)\s*:\s*([^;{}]+)/g)) {
    const kind = colorKind(property!);
    if (kind === undefined) continue;
    const rest = value!
      .replace(/var\((--[\w-]+)\)/g, (_, name: string) => (name.startsWith(kind) || (kind === '--line-' && name === '--focus') ? '' : ` ${name} `))
      .split(/[\s,/]+/)
      .filter((word) => word !== '' && !/^(?:-?[\d.]+(?:px|em|rem|%)?|solid|dashed|dotted|none|inset|transparent|currentcolor|inherit|initial|unset)$/i.test(word));
    if (rest.length > 0) misused.push(`${property}: ${value!.trim()}`);
  }
  return misused;
}

function colorKind(property: string): '--text-' | '--bg-' | '--line-' | undefined {
  if (/^(?:color|caret-color|text-decoration-color|-webkit-text-fill-color)$/.test(property)) return '--text-';
  if (/^background(?:-color)?$/.test(property)) return '--bg-';
  if (/^(?:border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|box-shadow|column-rule(?:-color)?|accent-color|fill|stroke)$/.test(property)) return '--line-';
  return undefined;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

// WCAG 2's relative luminance of an sRGB hex color.
function luminance(hex: string): number {
  const digits = hex.length === 4 ? [...hex.slice(1)].map((d) => d + d) : [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  const [r, g, b] = digits.map((d) => {
    const c = parseInt(d, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('every text token meets 4.5:1, and the focus ring 3:1, against every background token in both themes', () => {
  const tokens = colorTokens(theme);
  expect(tokens.filter((token) => token.name.startsWith('--text-')).length).toBeGreaterThan(0);
  expect(tokens.filter((token) => token.name.startsWith('--bg-')).length).toBeGreaterThan(0);
  expect(contrastFailures(tokens)).toEqual([]);
});

test('every color token is a text, background, line, or focus color, and the theme holds no color outside a token', () => {
  const tokens = colorTokens(theme);
  expect(tokens.map((token) => token.name).filter((name) => !/^--(?:text-|bg-|line-)[\w-]+$|^--focus$/.test(name))).toEqual([]);
  const declared = [...stripComments(theme).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name);
  expect(declared.filter((name) => !name!.startsWith('--font-') && !tokens.some((token) => token.name === name))).toEqual([]);
  const outsideTokens = stripComments(theme).replace(/--[\w-]+\s*:\s*light-dark\([^)]*\)/g, '');
  expect(colorLiterals('theme-without-tokens.css', outsideTokens)).toEqual([]);
});

test('no other file of the extension holds a color literal, and every stylesheet uses tokens of the right kind', () => {
  expect(productFiles.length).toBeGreaterThan(0);
  // A stylesheet read as empty would pass every check here: Vitest blanks stylesheets unless told not to.
  expect(stylesheets.filter(([, text]) => text.trim() === '').map(([path]) => path)).toEqual([]);
  expect(stylesheets.length).toBeGreaterThan(1);
  expect(productFiles.flatMap(([path, text]) => colorLiterals(path, text).map((literal) => `${path}: ${literal}`))).toEqual([]);
  expect(stylesheets.flatMap(([path, text]) => misusedColors(text).map((misuse) => `${path}: ${misuse}`))).toEqual([]);
});

test('tokens are defined once, in the theme, and nowhere redefined', () => {
  expect(tokenRedefinitions(theme, stylesheets)).toEqual([]);
});

/** A custom property a stylesheet other than the theme declares, or one the theme declares twice: either would draw a pair this file never checked. */
function tokenRedefinitions(themeText: string, sheets: readonly (readonly [string, string])[]): string[] {
  const declared = (css: string) => [...stripComments(css).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name!);
  const inTheme = declared(themeText);
  return [
    ...inTheme.filter((name, i) => inTheme.indexOf(name) !== i).map((name) => `theme: ${name} declared again`),
    ...sheets.filter(([path]) => path !== THEME).flatMap(([path, text]) => declared(text).map((name) => `${path}: ${name}`)),
  ];
}

test('every token a stylesheet or component uses is defined in the theme', () => {
  const defined = new Set([...stripComments(theme).matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name));
  const used = productFiles.concat(stylesheets).flatMap(([path, text]) => [...text.matchAll(/var\((--[\w-]+)\)/g)].map(([, name]) => `${path}: ${name}`));
  expect(used.filter((use) => !defined.has(use.split(': ')[1]))).toEqual([]);
});

// The check itself: each kind of failure it exists for is caught.
test('a token below 4.5:1, a color literal, and a color drawn with the wrong kind of token are each caught', () => {
  expect(contrastFailures(colorTokens(':root { --text-faint: light-dark(#999999, #ececf1); --bg-page: light-dark(#ffffff, #1a1a1f); }'))).toEqual([
    '--text-faint on --bg-page, light: 2.85:1',
  ]);
  expect(contrastFailures(colorTokens(':root { --focus: light-dark(#4b55d1, #2a2a3a); --bg-page: light-dark(#ffffff, #1a1a1f); }'))).toHaveLength(1);
  expect(colorLiterals('popup/a.css', '.a { color: #fff; }')).toContain('#fff');
  expect(colorLiterals('popup/a.css', '.a { background: rgb(0 0 0); }')).toContain('rgb(');
  expect(colorLiterals('popup/a.css', '.a { color: red; }')).toEqual(['color: red']);
  expect(colorLiterals('popup/a.css', '.a { color: var(--bg-page); }')).toEqual(['color: var(--bg-page)']);
  expect(colorLiterals('popup/a.css', '.a { background: var(--text-muted); }')).toEqual(['background: var(--text-muted)']);
  expect(colorLiterals('popup/a.css', '.a { border: 1px solid var(--line-control); outline: 2px solid var(--focus); color: var(--text-muted); }')).toEqual([]);
  expect(colorLiterals('popup/A.tsx', '<p style={{ color: "red" }} />')).toEqual(['color:']);
  expect(colorLiterals('popup/a.ts', "const shade = '#1a1a1f';")).toEqual(['#1a1a1f']);
  expect(tokenRedefinitions(':root { --text-muted: light-dark(#565662, #a9a9b5); }', [['./popup/a.css', '.row-url { --text-muted: var(--bg-page); }']])).toEqual([
    './popup/a.css: --text-muted',
  ]);
  expect(tokenRedefinitions(':root { --text-muted: light-dark(#565662, #a9a9b5); } .x { --text-muted: var(--bg-page); }', [])).toEqual([
    'theme: --text-muted declared again',
  ]);
});

// Draws the extension's icons, public/icons/icon16.png, icon48.png, and icon128.png: an indigo rounded
// square holding a white arrow that jumps up and to the right. The PNGs change only through this script
// (`node scripts/icons.ts`), which renders the one drawing below in Playwright's Chromium.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const iconsDir = path.resolve(import.meta.dirname, '..', 'public', 'icons');

const drawing = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect x="1" y="1" width="22" height="22" rx="6" fill="#4b55d1"/>
  <g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" transform="translate(2.4 2.4) scale(.8)">
    <path d="M8 16L17 7"/><path d="M10 7h7v7"/><circle cx="6.6" cy="17.4" r="1.7" fill="#fff" stroke="none"/>
  </g>
</svg>`;

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  for (const size of [16, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html, body { margin: 0 } svg { display: block; width: ${size}px; height: ${size}px }</style>${drawing}`);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), await page.screenshot({ omitBackground: true }));
    await page.close();
  }
} finally {
  await browser.close();
}

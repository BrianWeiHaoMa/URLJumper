// Draws the Chrome Web Store listing's media into web-store/: the screenshots (1280 by 800), the small promo
// tile (440 by 280), and the marquee promo tile (1400 by 560), each a 24-bit PNG without alpha, as the store
// takes them. The screenshots are captures of the real thing: Chromium runs headed on an X virtual framebuffer
// this script starts, with dist/ loaded and a sample document stored, and ImageMagick captures the screen; each
// capture is then set in a captioned frame that headless Chromium renders. Run `npm run build` first, then
// `node scripts/web-store-media.ts`, on Linux with Playwright's Chromium (README.md), Xvfb, xdotool (which
// types into Chrome's own address bar), ImageMagick (`import` and `magick`), and openssl (the sample site's
// certificate). The captures use the system's default sans-serif and monospace fonts, so another machine
// draws them with its own.
import { chromium, type Browser, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const distDir = path.join(root, 'dist');
const outDir = path.join(root, 'web-store');
const iconPath = path.join(root, 'public', 'icons', 'icon128.png');

// The virtual screen, in device pixels; every browser window sits at its top-left corner.
const SCREEN = { width: 1280, height: 800 };
// Chrome at this scale makes the popup's 13-pixel text legible in a screenshot the store shows smaller.
const SCALE = 1.25;
const SITE_HOST = 'wiki.example.com';

const SAMPLE_DOCUMENT = [
  '\\ Work',
  'mail                 https://mail.google.com/',
  'cal                  https://calendar.google.com/',
  'standup              https://meet.google.com/abc-defg-hij        \\ 9:30 every weekday',
  'handbook             https://wiki.example.com/handbook',
  'tickets              https://jira.example.com/browse/WEB',
  'dash                 http://192.168.1.136:8083/                  \\ the home server',
  '',
  '\\ Search: type the name, a space, then what to look for',
  'g                    https://www.google.com/search?q=%s',
  'yt                   https://www.youtube.com/results?search_query=%s',
  'wiki                 https://en.wikipedia.org/w/index.php?search=%s',
  'maps                 https://www.google.com/maps/search/%s',
  '',
  '\\ Reading',
  'news                 https://news.ycombinator.com/',
  'markets              https://finance.yahoo.com/',
  'mdn                  https://developer.mozilla.org/',
  '',
].join('\n');

const SITE_PAGES: Record<string, { title: string; heading: string }> = {
  '/handbook': { title: 'Team handbook', heading: 'Team handbook' },
  '/onboarding/benefits': { title: 'Benefits enrollment · Team handbook', heading: 'Benefits enrollment' },
};

/** A region of a screen capture, in device pixels. */
interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Screenshot {
  file: string;
  title: string;
  text: string;
  /** `side`: the caption at the left and the region at the right, full height; `top`: the caption above the region. */
  layout: 'side' | 'top';
}

const SCREENSHOTS: Record<'jump' | 'name' | 'argument' | 'document' | 'listDark' | 'addressBar', Screenshot> = {
  jump: {
    file: 'screenshot-1-jump.png',
    title: 'Type a name, press Enter, arrive.',
    text: 'Alt+N opens URLJumper on any page. Type part of a name, and Enter opens the match in a new tab; Shift+Enter opens it in this one.',
    layout: 'side',
  },
  name: {
    file: 'screenshot-2-name-this-page.png',
    title: 'Name the page you are on.',
    text: 'Alt+Shift+N, a right-click on a page or a link, or the popup’s button. Type a name, press Enter, and the line is in your document.',
    layout: 'side',
  },
  argument: {
    file: 'screenshot-3-search-through-a-name.png',
    title: 'Search through a name.',
    text: 'Put %s in a URL, and what you type after the name goes there: “yt lo-fi beats” searches YouTube for lo-fi beats.',
    layout: 'side',
  },
  document: {
    file: 'screenshot-4-your-document.png',
    title: 'Your mappings are one plain-text document.',
    text: 'Comment lines as headings, a note after a mapping, your own spacing: all kept. Edit it as text or line by line, and export it as a .txt file.',
    layout: 'top',
  },
  listDark: {
    file: 'screenshot-5-list-view-dark.png',
    title: 'Edit line by line, in light or dark.',
    text: 'The List view shows the same document as rows under their headings: rename, delete, move, or copy a destination, each change saved at once with Undo.',
    layout: 'top',
  },
  addressBar: {
    file: 'screenshot-6-address-bar.png',
    title: 'Or jump from the address bar.',
    text: 'Type j, a space, and a name: Chrome suggests your mappings in the order the popup would, and Enter opens the top one.',
    layout: 'top',
  },
};

const TAGLINE = 'Type a name, press Enter, arrive.';

/** A capture and the region of it a frame shows. */
interface Capture {
  file: string;
  region: Region;
}

/** A fresh profile with dist/ loaded, in a window of `window` device pixels at the screen's corner. */
interface Launched {
  worker: Worker;
  tab: Page;
  /** Opens the real action popup on `tab` by the toolbar button, returned once Chrome has given it the keyboard. */
  openPopup(): Promise<Page>;
  /** Closes the popup, when one is open. */
  closePopup(): Promise<void>;
  /** Moves the keyboard focus from Chrome's toolbar into the page, as a click on the page does. */
  focusPage(): void;
  /** The height of Chrome's tab strip and toolbar above the page, in device pixels. */
  toolbarHeight(): Promise<number>;
  close(): Promise<void>;
}

function toolOnPath(tool: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;
}

function checkPrerequisites(): void {
  if (!fs.existsSync(path.join(distDir, 'manifest.json'))) throw new Error('dist/manifest.json is missing: run `npm run build` first');
  for (const tool of ['Xvfb', 'xdotool', 'import', 'magick', 'openssl']) {
    if (!toolOnPath(tool)) throw new Error(`${tool} is not on PATH; this script needs Xvfb, xdotool, ImageMagick, and openssl`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function until(check: () => boolean | Promise<boolean>, failure: string, timeoutMs = 10_000): Promise<void> {
  for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; ) {
    if (await check()) return;
    await sleep(50);
  }
  throw new Error(failure);
}

// Starts Xvfb on the first free display from :90 and returns its name and how to stop it.
function startDisplay(): { display: string; stop(): void } {
  let number = 90;
  while (fs.existsSync(`/tmp/.X${number}-lock`)) number += 1;
  const display = `:${number}`;
  const xvfb = spawn('Xvfb', [display, '-screen', '0', `${SCREEN.width}x${SCREEN.height}x24`, '-nolisten', 'tcp'], { stdio: 'ignore' });
  const ready = Date.now() + 10_000;
  while (spawnSync('xdotool', ['getdisplaygeometry'], { env: { ...process.env, DISPLAY: display }, stdio: 'ignore' }).status !== 0) {
    if (Date.now() > ready || xvfb.exitCode !== null) throw new Error(`Xvfb did not come up on ${display}`);
    spawnSync('sleep', ['0.1']);
  }
  return { display, stop: () => void xvfb.kill('SIGTERM') };
}

// The sample site over HTTPS with a certificate made here; Chrome trusts the key by its SPKI hash (`spki`).
async function startSite(scratch: string): Promise<{ port: number; spki: string; close(): Promise<void> }> {
  const key = path.join(scratch, 'key.pem');
  const cert = path.join(scratch, 'cert.pem');
  execFileSync(
    'openssl',
    ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-subj', `/CN=${SITE_HOST}`, '-addext', `subjectAltName=DNS:${SITE_HOST}`, '-days', '2'],
    { stdio: 'ignore' },
  );
  const publicKey = execFileSync('openssl', ['x509', '-in', cert, '-pubkey', '-noout']);
  const spkiDer = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'der'], { input: publicKey });
  const spki = createHash('sha256').update(spkiDer).digest('base64');

  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (request, response) => {
    const page = SITE_PAGES[request.url ?? ''];
    response.statusCode = page ? 200 : 404;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(page ? sitePage(page) : '<!doctype html><title>Not found</title>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the sample site has no port');
  return {
    port: address.port,
    spki,
    close: async () => {
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
    },
  };
}

// A page the popup can sit on: a plain internal wiki, tinted so the popup's own background stands off it, and
// narrow, so that what the popup shots show of it beside the popup is its card's edge and no cut text.
function sitePage({ title, heading }: { title: string; heading: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  html { overflow: hidden; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #f3f4f8; color: #1f2330; }
  header { background: #fff; border-bottom: 1px solid #e2e4ec; padding: 14px 48px; display: flex; gap: 28px; align-items: center; font-size: 14px; color: #5a6072; }
  header b { color: #1f2330; font-size: 16px; margin-right: 12px; }
  main { width: 280px; margin: 40px 48px; background: #fff; border: 1px solid #e2e4ec; border-radius: 10px; padding: 36px 44px; }
  h1 { font-size: 30px; margin: 0 0 8px; }
  .meta { font-size: 13px; color: #7a8092; margin-bottom: 22px; }
  p { font-size: 16px; line-height: 26px; color: #3b4152; margin: 0 0 16px; }
</style></head><body>
<header><b>Team handbook</b></header>
<main><h1>${heading}</h1><div class="meta">Updated last week · Maintained by People Ops</div>
<p>This handbook is the one place for how the team works: how we plan, review, ship, and look after each other. Every page is kept by the people who do the work it describes.</p>
<p>New here? Start with onboarding, then the engineering pages. Anything out of date is a pull request away.</p></main>
</body></html>`;
}

interface LaunchOptions {
  display: string;
  /** The window's size, in device pixels. */
  size: { width: number; height: number };
  dark: boolean;
  sitePort: number;
  spki: string;
}

async function launch({ display, size, dark, sitePort, spki }: LaunchOptions): Promise<Launched> {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'urljumper-media-'));
  const env = { ...process.env, DISPLAY: display };
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: false,
    viewport: null,
    env,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
      '--enable-unsafe-extension-debugging',
      '--remote-debugging-port=0',
      `--force-device-scale-factor=${SCALE}`,
      // Chrome takes the window's size in CSS pixels.
      `--window-size=${Math.round(size.width / SCALE)},${Math.round(size.height / SCALE)}`,
      '--window-position=0,0',
      `--host-rules=MAP ${SITE_HOST} 127.0.0.1:${sitePort}`,
      `--ignore-certificate-errors-spki-list=${spki}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(dark ? ['--force-dark-mode'] : []),
    ],
  });
  const isExtension = (worker: Worker) => worker.url().startsWith('chrome-extension://');
  const worker = context.serviceWorkers().find(isExtension) ?? (await context.waitForEvent('serviceworker', { predicate: isExtension }));
  const id = new URL(worker.url()).host;
  // The install's own write lands first, so the sample document is not overwritten by it.
  await until(() => worker.evaluate(async () => 'searchOrder' in (await chrome.storage.local.get('searchOrder'))), 'the install wrote no search order');
  // Chrome's flag darkens its own UI only; the page's dark theme is the extension's own preference (F3).
  await worker.evaluate((items) => chrome.storage.local.set(items), { mappings: SAMPLE_DOCUMENT, ...(dark ? { themePref: 'dark' } : {}) });
  const tab = context.pages()[0] ?? (await context.newPage());
  const openPopups = () => worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })).length);
  // Chrome writes the port it chose to the profile once it listens.
  const portFile = path.join(profile, 'DevToolsActivePort');
  await until(() => fs.existsSync(portFile), 'Chrome wrote no debugging port');
  const debuggingPort = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  const connections: Browser[] = [];

  return {
    worker,
    tab,
    openPopup: () => openPopup(context, id, tab, debuggingPort, connections),
    closePopup: async () => {
      if ((await openPopups()) === 0) return;
      execFileSync('xdotool', ['key', 'Escape'], { env });
      await until(async () => (await openPopups()) === 0, 'the popup did not close');
    },
    focusPage: () => {
      // The bottom-left corner of the page, where no page here has a control; then the pointer leaves it.
      execFileSync('xdotool', ['mousemove', '12', String(size.height - 12), 'click', '1', 'mousemove', String(size.width - 2), String(size.height - 2)], { env });
    },
    toolbarHeight: async () => Math.round((await tab.evaluate(() => window.outerHeight - window.innerHeight)) * SCALE),
    close: async () => {
      for (const connection of connections) await connection.close();
      await context.close();
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

// The real action popup, found as the popup.html target the toolbar button opened and reached over a
// connection made after it opened: a connection made before never lists it.
async function openPopup(context: BrowserContext, id: string, tab: Page, debuggingPort: number, connections: Browser[]): Promise<Page> {
  const popupUrl = `chrome-extension://${id}/popup.html`;
  await tab.bringToFront();
  const cdp = await context.browser()!.newBrowserCDPSession();
  try {
    const targets = async (type: 'page' | 'tab') => (await cdp.send('Target.getTargets', { filter: [{ type }] })).targetInfos;
    const popupTargets = async () => (await targets('page')).filter((target) => target.url === popupUrl).map((target) => target.targetId);
    const before = new Set(await popupTargets());
    const tabTarget = (await targets('tab')).find((target) => target.url === tab.url());
    if (!tabTarget) throw new Error(`no tab at ${tab.url()}`);
    await cdp.send('Extensions.triggerAction', { id, targetId: tabTarget.targetId });
    let opened: string | undefined;
    await until(async () => (opened = (await popupTargets()).find((target) => !before.has(target))) !== undefined, 'no popup opened');

    const connection = await chromium.connectOverCDP(`http://127.0.0.1:${debuggingPort}`);
    connections.push(connection);
    for (const page of connection.contexts().flatMap((c) => c.pages())) {
      if (page.url() !== popupUrl) continue;
      const session = await page.context().newCDPSession(page);
      const { targetInfo } = await session.send('Target.getTargetInfo');
      await session.detach();
      if (targetInfo.targetId !== opened) continue;
      // Chrome shows the popup and gives it the keyboard once its load completes.
      await page.waitForFunction(() => document.hasFocus(), undefined, { polling: 20, timeout: 10_000 });
      return page;
    }
    throw new Error('the popup Chrome opened is not reachable over CDP');
  } finally {
    await cdp.detach();
  }
}

/** Where the popup sits on the screen, in device pixels, from its own window's position and size. */
async function popupRegion(popup: Page): Promise<Region> {
  const [left, top, width, height] = await popup.evaluate(() => [window.screenX, window.screenY, window.outerWidth, window.outerHeight]);
  return { left: Math.round(left! * SCALE), top: Math.round(top! * SCALE), width: Math.round(width! * SCALE), height: Math.round(height! * SCALE) };
}

// The whole screen's pixels, as ImageMagick reads them off the virtual framebuffer.
function captureScreen(display: string, file: string): void {
  execFileSync('import', ['-display', display, '-window', 'root', file]);
}

/** Every capture the frames show, by the screenshot it feeds, and `popupAlone`, the popup's own pixels for the marquee. */
async function captureAll(display: string, site: { port: number; spki: string }, scratch: string): Promise<Record<string, Capture>> {
  const captures: Record<string, Capture> = {};
  const capture = (name: string, region: Region) => {
    const file = path.join(scratch, `${name}.png`);
    captureScreen(display, file);
    captures[name] = { file, region };
  };
  const settle = () => sleep(700);
  const env = { ...process.env, DISPLAY: display };

  // The popup shots: the window fills the screen, and the frame shows its right 800 pixels at full height.
  const popupSide: Region = { left: SCREEN.width - 800, top: 0, width: 800, height: SCREEN.height };
  const light = await launch({ display, size: SCREEN, dark: false, sitePort: site.port, spki: site.spki });
  try {
    await light.tab.goto(`https://${SITE_HOST}/handbook`);
    let popup = await light.openPopup();
    await popup.keyboard.type('ma', { delay: 40 });
    await settle();
    capture('jump', popupSide);
    captures.popupAlone = { file: captures.jump!.file, region: await popupRegion(popup) };
    await light.closePopup();

    popup = await light.openPopup();
    await popup.keyboard.type('yt lo-fi beats', { delay: 40 });
    await settle();
    capture('argument', popupSide);
    await light.closePopup();

    await light.tab.goto(`https://${SITE_HOST}/onboarding/benefits`);
    popup = await light.openPopup();
    await popup.getByRole('button', { name: 'Name this page' }).click();
    await popup.keyboard.type('benefits', { delay: 40 });
    await settle();
    capture('name', popupSide);
    await light.closePopup();

    // The settings page's own pixels, below the toolbar, 1120 wide from the window's middle.
    await light.tab.goto(`chrome-extension://${new URL(light.worker.url()).host}/options.html#view=text`);
    light.focusPage();
    await settle();
    capture('document', { left: (SCREEN.width - 1120) / 2, top: await light.toolbarHeight(), width: 1120, height: 640 });
  } finally {
    await light.close();
  }

  // The dark shots, in a window 1120 wide the frame shows from its top-left: the settings page's pixels below
  // the toolbar, then the address bar last, since the text typed there stays in the bar.
  const size = { width: 1120, height: SCREEN.height };
  const dark = await launch({ display, size, dark: true, sitePort: site.port, spki: site.spki });
  try {
    await dark.tab.goto(`chrome-extension://${new URL(dark.worker.url()).host}/options.html#view=list`);
    dark.focusPage();
    await settle();
    capture('listDark', { left: 0, top: await dark.toolbarHeight(), width: 1120, height: 640 });

    await dark.tab.goto(`https://${SITE_HOST}/handbook`);
    dark.focusPage();
    execFileSync('xdotool', ['key', '--clearmodifiers', 'ctrl+l'], { env });
    await sleep(300);
    execFileSync('xdotool', ['type', '--delay', '120', 'j '], { env });
    await sleep(500);
    execFileSync('xdotool', ['type', '--delay', '120', 'ma'], { env });
    await sleep(1500);
    capture('addressBar', { left: 0, top: 0, width: size.width, height: 640 });
  } finally {
    await dark.close();
  }
  return captures;
}

function dataUri(file: string): string {
  return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
}

// The brand surface every piece shares: the icon's indigo, deepened toward one corner.
const FRAME_STYLE = `
  html, body { margin: 0; }
  .frame { position: relative; overflow: hidden; background: linear-gradient(135deg, #2f3799 0%, #4b55d1 100%); color: #fff; font-family: Inter, system-ui, sans-serif; }
  h1 { margin: 0; font-weight: 700; letter-spacing: -0.015em; }
  p { margin: 0; opacity: 0.88; }
  .inset { position: absolute; overflow: hidden; border-radius: 12px; box-shadow: 0 24px 64px rgba(10, 12, 50, 0.45); background: #fff; }
  .inset img { position: absolute; display: block; }
`;

/** The region of a capture, pixel for pixel, in an inset box. */
function insetHtml({ file, region }: Capture, box: { left: number; top: number; width: number; height: number }): string {
  const size = fs.readFileSync(file);
  // The PNG's size, from its IHDR chunk.
  const width = size.readUInt32BE(16);
  const height = size.readUInt32BE(20);
  return `<div class="inset" style="left: ${box.left}px; top: ${box.top}px; width: ${box.width}px; height: ${box.height}px">
    <img src="${dataUri(file)}" width="${width}" height="${height}" style="left: ${-region.left}px; top: ${-region.top}px" alt=""></div>`;
}

function screenshotHtml(shot: Screenshot, capture: Capture): string {
  const side = shot.layout === 'side';
  const caption = side
    ? `.caption { position: absolute; left: 72px; top: 72px; width: 336px; } h1 { font-size: 40px; line-height: 48px; } p { margin-top: 18px; font-size: 19px; line-height: 29px; }`
    : `.caption { position: absolute; left: 80px; top: 52px; width: 1120px; } h1 { font-size: 38px; line-height: 46px; } p { margin-top: 10px; font-size: 19px; line-height: 28px; max-width: 980px; }`;
  const box = side ? { left: 456, top: 48, width: 800, height: 752 } : { left: 80, top: 184, width: 1120, height: 616 };
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_STYLE} .frame { width: 1280px; height: 800px; } ${caption}</style></head>
<body><div class="frame"><div class="caption"><h1>${shot.title}</h1><p>${shot.text}</p></div>${insetHtml(capture, box)}</div></body></html>`;
}

function smallTileHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_STYLE}
  .frame { width: 440px; height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  img { width: 72px; height: 72px; border-radius: 16px; box-shadow: 0 10px 30px rgba(10, 12, 50, 0.4); }
  h1 { margin-top: 18px; font-size: 34px; line-height: 40px; }
  p { margin-top: 6px; font-size: 16px; line-height: 22px; }
</style></head><body><div class="frame">
  <img src="${dataUri(iconPath)}" alt=""><h1>URLJumper</h1><p>${TAGLINE}</p>
</div></body></html>`;
}

function marqueeHtml(popup: Capture): string {
  const { width, height } = popup.region;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_STYLE}
  .frame { width: 1400px; height: 560px; }
  .text { position: absolute; left: 88px; top: 118px; width: 560px; }
  .brand { display: flex; align-items: center; gap: 20px; }
  .brand img { width: 64px; height: 64px; border-radius: 14px; box-shadow: 0 10px 30px rgba(10, 12, 50, 0.4); }
  h1 { font-size: 52px; line-height: 60px; }
  .tagline { margin-top: 26px; font-size: 28px; line-height: 36px; font-weight: 600; opacity: 1; }
  ul { margin: 22px 0 0; padding: 0; list-style: none; font-size: 19px; line-height: 32px; opacity: 0.88; }
</style></head><body><div class="frame">
  <div class="text">
    <div class="brand"><img src="${dataUri(iconPath)}" alt=""><h1>URLJumper</h1></div>
    <p class="tagline">${TAGLINE}</p>
    <ul><li>Alt+N opens it on any page</li><li>Your mappings in one plain-text document</li><li>Name the page you are on with Alt+Shift+N</li></ul>
  </div>
  ${insetHtml(popup, { left: 1400 - width - 80, top: Math.round((560 - height) / 2), width, height })}
</div></body></html>`;
}

// Renders each piece's HTML at its size and writes it as a 24-bit PNG without alpha.
async function render(pieces: { file: string; width: number; height: number; html: string }[], scratch: string): Promise<void> {
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    for (const piece of pieces) {
      const page = await browser.newPage({ viewport: { width: piece.width, height: piece.height } });
      await page.setContent(piece.html);
      await page.evaluate(() => document.fonts.ready);
      const rendered = path.join(scratch, `rendered-${piece.file}`);
      fs.writeFileSync(rendered, await page.screenshot());
      await page.close();
      execFileSync('magick', [rendered, '-alpha', 'off', `PNG24:${path.join(outDir, piece.file)}`]);
    }
  } finally {
    await browser.close();
  }
}

checkPrerequisites();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'urljumper-web-store-'));
const screen = startDisplay();
try {
  const site = await startSite(scratch);
  let captures: Record<string, Capture>;
  try {
    captures = await captureAll(screen.display, site, scratch);
  } finally {
    await site.close();
  }
  fs.mkdirSync(outDir, { recursive: true });
  const shots = Object.entries(SCREENSHOTS).map(([name, shot]) => {
    const capture = captures[name];
    if (!capture) throw new Error(`no capture for ${name}`);
    return { file: shot.file, width: 1280, height: 800, html: screenshotHtml(shot, capture) };
  });
  await render(
    [
      ...shots,
      { file: 'promo-small.png', width: 440, height: 280, html: smallTileHtml() },
      { file: 'promo-marquee.png', width: 1400, height: 560, html: marqueeHtml(captures.popupAlone!) },
    ],
    scratch,
  );
  console.log(`${path.relative(root, outDir)}/: ${shots.length} screenshots and 2 promo tiles`);
} finally {
  screen.stop();
  fs.rmSync(scratch, { recursive: true, force: true });
}

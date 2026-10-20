# URLJumper

URLJumper is a Chrome extension for opening web pages by names you keep in one plain-text document: type a name, press Enter, arrive. What it does is specified in `PRODUCT_SPECIFICATION.md`, and how it is built in `TECHNICAL_SPECIFICATION.md`.

[![Available in the Chrome Web Store](https://github.com/user-attachments/assets/a363098f-4993-4157-b9a4-79f5714c443c)](https://chromewebstore.google.com/detail/url-jumper/dbhbcgodajbjmemahnaigmlgjdkgghik)

## Prerequisites

- Node.js 24 and npm.
- For the end-to-end checks, and for the scripts that draw the icons and the store media: Playwright's Chromium, installed once after `npm ci` with `npx playwright install chromium` (on Linux, `npx playwright install --with-deps chromium` also installs the system libraries it needs).
- For the end-to-end check of the upgrade from 1.3.0 (`e2e/upgrade-from-1x.spec.ts`), which builds 1.3.0 from the project's history and updates it to the new build: a clone whose history holds commit `b0a1994`, the last 1.x commit (a shallow clone lacks it: `git fetch --unshallow`); `tar`, which unpacks that commit's tree (part of Linux, macOS, and Windows 10 and later); and, the first time, the npm registry, for 1.3.0's own `npm ci`. The 1.3.0 build is made in a temporary directory and kept, untracked, in `node_modules/.cache/urljumper-1x/` for later runs; nothing of it enters the package.

## Build the Web Store package

```sh
npm ci
npm run package
```

`npm run package` type-checks the code, builds the extension into `dist/`, and zips `dist/` into `release/URLJumper.zip`, the file uploaded to the Chrome Web Store. It stops at the first failure and then leaves any earlier zip as it was.

A release follows `RELEASING.md`; `CHANGELOG.md` lists every release. The store listing's text and images are kept in `web-store/`.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs the unit checks (Vitest, `src/**/*.test.ts`). |
| `npm run typecheck` | Type-checks every TypeScript file, strict. |
| `npm run build` | Builds the extension into `dist/`. |
| `npm run e2e` | Runs `npm run package`, then the end-to-end checks (Playwright, `e2e/**/*.spec.ts`) against the build loaded into headless Chromium. |
| `node scripts/web-store-media.ts` | Draws the Chrome Web Store listing's screenshots and promo tiles into `web-store/` from `dist/`, on Linux with Xvfb, xdotool, ImageMagick, and openssl installed. |

## Load it unpacked

After `npm run build`, open `chrome://extensions`, turn on *Developer mode*, choose *Load unpacked*, and select the `dist/` directory.

## License

MIT; see `LICENSE`.

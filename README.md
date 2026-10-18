# URLJumper

URLJumper is a Chrome extension for opening web pages by names you keep in one plain-text document: type a name, press Enter, arrive. What it does is specified in `PRODUCT_SPECIFICATION.md`, and how it is built in `TECHNICAL_SPECIFICATION.md`.

## Prerequisites

- Node.js 24 and npm.
- For the end-to-end checks only: Playwright's Chromium, installed once after `npm ci` with `npx playwright install chromium` (on Linux, `npx playwright install --with-deps chromium` also installs the system libraries it needs).

## Build the Web Store package

```sh
npm ci
npm run package
```

`npm run package` type-checks the code, builds the extension into `dist/`, and zips `dist/` into `release/URLJumper.zip`, the file uploaded to the Chrome Web Store. It stops at the first failure and then leaves any earlier zip as it was.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs the unit checks (Vitest, `src/**/*.test.ts`). |
| `npm run typecheck` | Type-checks every TypeScript file, strict. |
| `npm run build` | Builds the extension into `dist/`. |
| `npm run e2e` | Runs `npm run package`, then the end-to-end checks (Playwright, `e2e/**/*.spec.ts`) against the build loaded into headless Chromium. |

## Load it unpacked

After `npm run build`, open `chrome://extensions`, turn on *Developer mode*, choose *Load unpacked*, and select the `dist/` directory.

## License

MIT; see `LICENSE`.

# Releasing URLJumper

A release is the Web Store package built from a tagged commit of `main`, uploaded by hand through the Chrome Web Store developer dashboard. Everything below runs from the repository root, on a clone with full history (the upgrade check builds 1.3.0 from commit `b0a1994`), with the prerequisites `README.md` lists.

## 1. Prepare the release commit

1. Set `version` in `manifest.config.ts`: one to four dot-separated integers, each 0 to 65535 with no leading zero (Chrome's rule), and higher than the last version published (the store's rule).
2. In `CHANGELOG.md`, give the version its date and make sure everything since the last release is listed, in the product's own terms.
3. If users should be told what is new: the one-line notice and `whats-new.html` are shown only after an update from 1.x (`src/service-worker/install.ts`). A later release that wants a notice of its own needs a product amendment first.
4. If the popup or a settings view changed in a way a store screenshot shows, redraw the listing's media: `npm run build`, then `node scripts/web-store-media.ts` (Linux with Xvfb, xdotool, ImageMagick, and openssl installed; the script names what is missing), and look at every image under `web-store/`. Update `web-store/listing.md` where the description or a caption no longer matches the product.
5. Run every check: `npm ci && npm test && npm run e2e`. The last also writes `release/URLJumper.zip`. CI runs the same on every push.
6. Load `dist/` unpacked (`README.md`, *Load it unpacked*) and try the release by hand, for what the checks cannot see: a real Alt+N and Alt+Shift+N on your keyboard, a jump, Name this page, `j` and a name in the address bar, the settings page, and the popup on a display scaled at 125% if you have one.
7. Stage everything the release changes and commit on `main`: `git add -A && git commit -m "URLJumper <version>"`.

## 2. Tag and publish on GitHub

1. `git tag -a v<version> -m "URLJumper <version>"`, then `git push origin main v<version>`.
2. The Release workflow (`.github/workflows/release.yml`) runs on the tag: the checks, a check that the tag names the manifest's version, and a GitHub release with `URLJumper.zip` attached. Without it, `npm run package` on the tagged commit and `gh release create v<version> release/URLJumper.zip` do the same.

## 3. Upload to the Chrome Web Store

1. Take `URLJumper.zip` from the GitHub release, or `release/URLJumper.zip` from `npm run package` on the tagged commit.
2. In the developer dashboard, open the item (the listing at https://chromewebstore.google.com/detail/url-jumper/dbhbcgodajbjmemahnaigmlgjdkgghik), then *Package* › *Upload new package*, and choose the zip. The dashboard reads the name, version, and summary from the manifest.
3. *Store listing*: the description and category from `web-store/listing.md`; the screenshots and promo tiles from `web-store/`, in the order `listing.md` gives.
4. *Privacy*: the single-purpose description, the permission justifications, and the data-use declaration from `web-store/listing.md`.
5. *Submit for review*. The permissions are those of 1.1.0 and later plus `contextMenus`, which shows no warning, so those users update without a prompt; a profile still on 1.0.x lacked `clipboardWrite` and may be asked.

## 4. After publication

- Open the listing and check the version shown.
- On a profile that still has 1.x, let Chrome update the extension and check that the document is as it was and the first popup shows the upgrade notice.
- Start the next version's entry in `CHANGELOG.md`.

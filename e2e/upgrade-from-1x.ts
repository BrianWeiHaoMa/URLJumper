// An upgrade from 1.x as Chrome makes it: 1.3.0, the last 1.x release, built from the project's history and kept
// outside the tracked tree, loaded unpacked into a fresh profile; then dist/ put in its place in the same
// directory and reloaded from chrome://extensions with developer mode on, which Chrome takes as an update
// (`onInstalled` with reason `update` and `previousVersion` 1.3.0, storage and reassigned shortcuts kept).
// Through e2e/extension.ts, as the `release1x` fixture.
import type { BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { distDir, isExtensionWorker, launchChrome, waitForStoredKey, type LoadedExtension } from './extension-launch.ts';

/** The last 1.x commit, whose product files are 1.3.0's as published. */
const RELEASE_1X_COMMIT = 'b0a199430d3ed61c9c0661218bcbdef2ac3ff39b';
const repository = path.resolve(import.meta.dirname, '..');
// Under node_modules, which neither Git nor the package holds, so no 1.x file enters the tree or the upload.
const keptBuilds = path.join(repository, 'node_modules', '.cache', 'urljumper-1x');

/** 1.3.0 as Chrome runs it from its unpacked directory, before the update. */
export interface Release1x {
  context: BrowserContext;
  id: string;
  /** The address of a file in 1.3.0's package, such as its `options_page`. */
  url(file: string): string;
  /** 1.3.0's built manifest. */
  manifest: chrome.runtime.Manifest;
  /**
   * Chrome's update to the build in dist/: its files put in 1.3.0's place in the unpacked directory, then a
   * reload from chrome://extensions with developer mode on. Resolves to 2.0 loaded once its worker has recorded
   * the update; 1.3.0's pages are closed and its handles dead.
   */
  update(): Promise<LoadedExtension>;
}

/**
 * The directory of 1.3.0's build kept from an earlier run, else built now: `git archive` of its commit, its own
 * `npm ci` and build in a scratch directory. A build is kept only by renaming its whole output into place, so
 * one cut short is never taken for a whole one.
 */
export function keptRelease1xBuild(): string {
  const kept = path.join(keptBuilds, RELEASE_1X_COMMIT);
  if (fs.existsSync(kept)) return kept;
  run(
    'git',
    ['cat-file', '-e', `${RELEASE_1X_COMMIT}^{commit}`],
    repository,
    `1.3.0 is built from commit ${RELEASE_1X_COMMIT}, which this clone's history lacks: fetch it (in a shallow clone, git fetch --unshallow)`,
  );
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'urljumper-1x-build-'));
  try {
    const tree = path.join(scratch, 'tree');
    fs.mkdirSync(tree);
    run('git', ['archive', `--output=${path.join(scratch, 'tree.tar')}`, RELEASE_1X_COMMIT], repository, `git archive of ${RELEASE_1X_COMMIT} failed`);
    run('tar', ['-x', '-f', path.join(scratch, 'tree.tar'), '-C', tree], scratch, "1.3.0's tree could not be unpacked");
    run('npm', ['ci', '--no-audit', '--no-fund'], tree, "1.3.0's own npm ci failed; a first build needs the npm registry");
    run('npm', ['run', 'build'], tree, "1.3.0's own build failed");
    fs.mkdirSync(keptBuilds, { recursive: true });
    const staged = fs.mkdtempSync(path.join(keptBuilds, `.${RELEASE_1X_COMMIT}-`));
    fs.cpSync(path.join(tree, 'dist'), staged, { recursive: true });
    try {
      fs.renameSync(staged, kept);
    } catch (error) {
      // Another worker kept its build of the same commit first, which is as whole as this one.
      fs.rmSync(staged, { recursive: true, force: true });
      if (!fs.existsSync(kept)) throw error;
    }
    return kept;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
}

/**
 * Runs `use` with 1.3.0 from `build` loaded unpacked into a fresh profile; then closes Chrome, failing unless no
 * request from the extension's origin, 1.3.0's or 2.0's, reached the network undeclared.
 */
export async function withRelease1x(build: string, use: (release: Release1x) => Promise<void>): Promise<void> {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'urljumper-1x-'));
  try {
    // The unpacked directory Chrome loads, kept for the whole run: the extension's id follows it.
    const directory = path.join(scratch, 'extension');
    fs.cpSync(build, directory, { recursive: true });
    const launched = await launchChrome(directory);
    try {
      const id = new URL((await launched.extensionWorker()).url()).host;
      await use({
        context: launched.context,
        id,
        url: (file) => `chrome-extension://${id}/${file}`,
        manifest: JSON.parse(fs.readFileSync(path.join(build, 'manifest.json'), 'utf8')),
        update: async () => {
          for (const entry of fs.readdirSync(directory)) fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
          fs.cpSync(distDir, directory, { recursive: true });
          const started = launched.context.waitForEvent('serviceworker', { predicate: isExtensionWorker, timeout: 15_000 });
          const page = await launched.context.newPage();
          try {
            await page.goto('chrome://extensions');
            // With developer mode off, Chrome disables an unpacked extension reloaded with new files.
            await page.evaluate(async (id) => {
              const { developerPrivate } = chrome as unknown as { developerPrivate: DeveloperPrivate };
              await developerPrivate.updateProfileConfiguration({ inDeveloperMode: true });
              await developerPrivate.reload(id, { failQuietly: false });
            }, id);
          } finally {
            await page.close();
          }
          const worker = await started;
          // An update from 1.x is recorded as the new worker's first act: no check starts before it has landed.
          await waitForStoredKey(worker, 'upgradeNotice', 'the update from 1.3.0 wrote no upgrade notice');
          return launched.loadedExtension(worker);
        },
      });
    } finally {
      await launched.close();
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  }
}

// What chrome://extensions may call, which Chrome's typings leave out.
interface DeveloperPrivate {
  updateProfileConfiguration(update: { inDeveloperMode: boolean }): Promise<void>;
  reload(id: string, options: { failQuietly: boolean }): Promise<void>;
}

function run(command: string, args: string[], cwd: string, failure: string) {
  try {
    execFileSync(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim();
    throw new Error(`${failure}\n${stderr.split('\n').slice(-15).join('\n') || String(error)}`);
  }
}

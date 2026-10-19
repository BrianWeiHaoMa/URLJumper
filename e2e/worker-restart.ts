// Stopping the extension's service worker as Chrome does after 30 seconds without events (S2), so a check sees
// what survives in storage and nothing of the worker's memory, also between a write and its reply;
// re-exported by e2e/extension.ts.
import type { BrowserContext, Worker } from '@playwright/test';

/**
 * Stops `worker` and starts it again with `wake`, an event or a message from outside it; fails unless the
 * worker running afterwards holds nothing of the old one's memory. `worker` then reaches the new one.
 */
export async function restartWorker(context: BrowserContext, worker: Worker, wake: () => Promise<unknown>): Promise<void> {
  await worker.evaluate(() => {
    (globalThis as Record<string, unknown>).beforeRestart = true;
  });
  const browser = context.browser();
  if (!browser) throw new Error('the persistent context has no browser to open a CDP session on');
  const cdp = await browser.newBrowserCDPSession();
  try {
    const targets = async () => (await cdp.send('Target.getTargets', { filter: [{ type: 'service_worker' }] })).targetInfos.filter((target) => target.url === worker.url());
    const [target] = await targets();
    if (target === undefined) throw new Error('the worker has no target to close');
    await cdp.send('Target.closeTarget', { targetId: target.targetId });
    // A page's message may start the next worker before `wake` does, under the same target: stopped is no
    // target, or one whose worker holds nothing of the old one's memory. An evaluation in a worker Chrome is
    // still closing can go unanswered for good, so one unanswered after a second counts as no restart yet.
    const restartedMeanwhile = () =>
      Promise.race([
        worker.evaluate(() => !('beforeRestart' in globalThis)).catch(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_000)),
      ]);
    for (const deadline = Date.now() + 10_000; (await targets()).length > 0 && !(await restartedMeanwhile()); ) {
      if (Date.now() > deadline) throw new Error('the worker did not stop');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    await cdp.detach();
  }
  await wake();
  if (await worker.evaluate(() => 'beforeRestart' in globalThis)) throw new Error('the worker kept its memory: it did not restart');
}

/**
 * Makes `worker`'s writes of `key` land and then never return, so a worker stopped after one has stored it
 * and sent no reply, as Chrome stopping the worker between the two leaves them.
 */
export async function stallWorkerAfterWriting(worker: Worker, key: string): Promise<void> {
  await worker.evaluate((key) => {
    const local = chrome.storage.local;
    const set = local.set.bind(local) as (items: Record<string, unknown>) => Promise<void>;
    (local as unknown as { set: unknown }).set = async (items: Record<string, unknown>) => {
      await set(items);
      if (key in items) await new Promise(() => {});
    };
  }, key);
}

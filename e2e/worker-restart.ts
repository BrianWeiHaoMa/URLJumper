// Stopping the extension's service worker as Chrome does after 30 seconds without events (S2), so a check sees
// what survives in storage and nothing of the worker's memory; re-exported by e2e/extension.ts.
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
    for (const deadline = Date.now() + 10_000; (await targets()).length > 0; ) {
      if (Date.now() > deadline) throw new Error('the worker did not stop');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    await cdp.detach();
  }
  await wake();
  if (await worker.evaluate(() => 'beforeRestart' in globalThis)) throw new Error('the worker kept its memory: it did not restart');
}

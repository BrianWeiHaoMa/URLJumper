// The notice of what is new in the popup, through e2e/extension.ts: the one place checks find the notice and
// its controls, so the notice's own checks and the upgrade's find the same ones.
import { expect, type Locator, type Page } from '@playwright/test';

/** The notice of what is new in `popup`, its control that opens the what's-new page, and its close control. */
export function upgradeNotice(popup: Page): { notice: Locator; open: Locator; close: Locator } {
  const notice = popup.getByRole('region', { name: "What's new", exact: true });
  return {
    notice,
    open: notice.getByRole('button', { name: "URLJumper 2.0 is here: see what's new", exact: true }),
    close: notice.getByRole('button', { name: "Close the notice of what's new", exact: true }),
  };
}

/** Waits until `popup` is ready (its footer no longer says it is not), then fails if it shows the notice. */
export async function expectNoNotice(popup: Page): Promise<void> {
  const footer = popup.locator('footer');
  await expect(footer).not.toHaveText(/until the popup is ready/);
  await expect(footer).not.toHaveText(/notice/);
  await expect(upgradeNotice(popup).notice).toHaveCount(0);
}

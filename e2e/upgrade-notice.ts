// The notice of what is new in the popup, through e2e/extension.ts: the one place checks find the notice and
// its controls, so the notice's own checks and the upgrade's find the same ones.
import type { Locator, Page } from '@playwright/test';

/** The notice of what is new in `popup`, its control that opens the what's-new page, and its close control. */
export function upgradeNotice(popup: Page): { notice: Locator; open: Locator; close: Locator } {
  const notice = popup.getByRole('region', { name: "What's new", exact: true });
  return {
    notice,
    open: notice.getByRole('button', { name: "URLJumper 2.0 is here: see what's new", exact: true }),
    close: notice.getByRole('button', { name: "Close the notice of what's new", exact: true }),
  };
}

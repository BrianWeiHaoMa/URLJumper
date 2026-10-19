// The List view as a check reaches it, re-exported by e2e/extension.ts: its list and parts found by their
// names and classes, and the view opened in the popup's settings by the *List* button or on the options page at
// a fragment, once it lists the stored document.
import { expect, type BrowserContext, type Page } from '@playwright/test';

/** The List view's parts in `page`, a popup or an options page that shows it. */
export function listView(page: Page) {
  const list = page.getByRole('list', { name: 'Document lines' });
  return {
    list,
    /** Every row that lists a line, mapping or unreadable, in document order. */
    rows: list.locator('.list-row'),
    /** The mapping rows. */
    mappingRows: list.locator('.list-row:not(.unreadable)'),
    /** The unreadable rows. */
    unreadableRows: list.locator('.list-row.unreadable'),
    /** The line numbers the rows show, in order. */
    numbers: list.locator('.list-row .list-number'),
    names: list.locator('.list-name'),
    urls: list.locator('.list-url'),
    notes: list.locator('.list-note'),
    /** The raw text of each unreadable row. */
    raw: list.locator('.list-raw'),
    headings: list.getByRole('heading'),
    /** The pencils, each named `Edit "‹name›"`, in document order. */
    pencils: list.locator('.list-row').getByRole('button', { name: /^Edit "/s }),
    /** The pencil of the mapping named `name`. */
    pencil: (name: string) => list.getByRole('button', { name: `Edit "${name}"`, exact: true }),
    fixInText: list.getByRole('button', { name: 'Fix in text', exact: true }),
    /** What the view says when the document holds no mapping. */
    empty: page.getByText('The document has no mappings.'),
  };
}

export type ListView = ReturnType<typeof listView>;

/** Opens the popup's settings by the gear, in search or the first run, and shows the List view once it lists the stored document. */
export async function listViewInPopup(popup: Page): Promise<ListView> {
  await popup.getByRole('button', { name: 'Settings' }).click();
  await popup.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'List', exact: true }).click();
  return listed(listView(popup));
}

/** Opens a tab of `options.html` at `fragment`, the List view by default, and returns it once it lists the stored document. */
export async function listViewOnOptionsPage(extension: { context: BrowserContext; url(file: string): string }, fragment = '#view=list'): Promise<ListView & { page: Page }> {
  const page = await extension.context.newPage();
  await page.goto(extension.url(`options.html${fragment}`));
  return { page, ...(await listed(listView(page))) };
}

/** Once the view has read the document: it lists its lines, or says it holds no mapping. */
async function listed(view: ListView): Promise<ListView> {
  await expect(view.list.or(view.empty).first()).toBeVisible();
  return view;
}

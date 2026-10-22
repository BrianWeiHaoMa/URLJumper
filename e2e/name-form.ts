// The Name form as a check reaches it, re-exported by e2e/extension.ts: its fields, the Section choice, the
// preview, what it says of a value, and its actions, found inside the form wherever it is hosted, so a row
// editor beside it is never taken for it.
import type { Page } from '@playwright/test';

/** The Name form's parts in `page`, a popup or an options page that shows it. */
export function nameForm(page: Page) {
  const form = page.locator('form.name-form');
  return {
    form,
    name: form.getByRole('textbox', { name: 'Name', exact: true }),
    url: form.getByRole('textbox', { name: 'URL', exact: true }),
    note: form.getByRole('textbox', { name: 'Note', exact: true }),
    copyName: form.getByRole('button', { name: 'Copy name', exact: true }),
    copyUrl: form.getByRole('button', { name: 'Copy URL', exact: true }),
    copyNote: form.getByRole('button', { name: 'Copy note', exact: true }),
    said: form.locator('.form-said'),
    /** The Section choice, shown when the document has headings, and its options. */
    sections: form.getByRole('listbox', { name: 'Section' }),
    section: (name: string) => form.getByRole('option', { name, exact: true }),
    /** What the form names, a page or a link, with *This page is*; none for a form with no page. */
    subject: form.locator('.subject'),
    thisPage: form.locator('.this-page'),
    /** Where the line goes, and the exact line. */
    where: form.locator('.preview-where'),
    previewLine: form.locator('.preview-line'),
    /** Why Save is blocked, or what a Save that stored nothing came to. */
    problem: form.locator('#name-form-problem'),
    save: form.getByRole('button', { name: 'Save', exact: true }),
    cancel: form.getByRole('button', { name: 'Cancel', exact: true }),
    /** *Edit "‹name›" instead*, offered beside a taken name. */
    editInstead: form.getByRole('button', { name: /^Edit ".*" instead$/s }),
  };
}

export type NameForm = ReturnType<typeof nameForm>;

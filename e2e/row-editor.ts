// A row's editor as a check reaches it, re-exported by e2e/extension.ts: its fields, actions, and what it says,
// found by their names, wherever it is hosted; its opening by Ctrl+E on the popup's selected row, and the
// pencils that open it, the rows' and *This page is*'s; and the confirmation of a single-line change with its
// Undo.
import { expect, type Page } from '@playwright/test';

/** The row editor's parts in `page`. */
export function rowEditor(page: Page) {
  // Its own fields alone: the Name form open beside it has a Name, URL, and Note of its own.
  const editor = page.locator('.row-editor');
  return {
    name: editor.getByRole('textbox', { name: 'Name', exact: true }),
    url: editor.getByRole('textbox', { name: 'URL', exact: true }),
    note: editor.getByRole('textbox', { name: 'Note', exact: true }),
    copyName: editor.getByRole('button', { name: 'Copy name', exact: true }),
    copyUrl: editor.getByRole('button', { name: 'Copy URL', exact: true }),
    copyNote: editor.getByRole('button', { name: 'Copy note', exact: true }),
    save: page.getByRole('button', { name: 'Save', exact: true }),
    delete: page.getByRole('button', { name: 'Delete', exact: true }),
    copyLink: page.getByRole('button', { name: 'Copy link', exact: true }),
    /** In the popup, above the fields, in its own editor and the List view's. */
    copyTabUrl: page.getByRole('button', { name: 'Copy tab URL', exact: true }),
    /** The arrow icons offered in the List view, on a line with Cancel below the other actions. */
    moves: page.locator('.row-editor-moves'),
    moveUp: page.getByRole('button', { name: 'Move up', exact: true }),
    moveDown: page.getByRole('button', { name: 'Move down', exact: true }),
    openInText: page.getByRole('button', { name: 'Open in text', exact: true }),
    cancel: page.getByRole('button', { name: 'Cancel', exact: true }),
    editAgain: page.getByRole('button', { name: 'Edit again', exact: true }),
    /** *Edit "‹name›" instead*, offered beside a taken name. */
    editInstead: page.getByRole('button', { name: /^Edit ".*" instead$/s }),
    /** A value's problem, naming the line. */
    problem: page.locator('.row-editor .form-problem'),
    /** That another line has the name. */
    taken: page.locator('.row-editor-taken-text'),
    /** What became of a line a Save or Delete found stale, and the line as it now stands when it changed. */
    stale: page.locator('.row-editor-stale-text'),
    staleLine: page.locator('.row-editor-line'),
    /** What the last action came to when it stored nothing, or what *Copy link* did. */
    said: page.locator('.row-editor-said'),
    /** In the popup, the row's name and URL as the list showed them, above the editor. */
    header: page.locator('.editor-header'),
  };
}

export type RowEditor = ReturnType<typeof rowEditor>;

/** Presses Ctrl+E in the popup's search and returns the editor it opened, once its name field has the focus. */
export async function editSelectedRow(popup: Page): Promise<RowEditor> {
  await popup.keyboard.press('Control+e');
  const editor = rowEditor(popup);
  await expect(editor.name).toBeFocused();
  return editor;
}

/** The pencils of the popup's search window, in row order, each named `Edit "‹name›"`. */
export function rowPencils(popup: Page) {
  return popup.locator('.row-pencils').getByRole('button');
}

/** The pencil beside *This page is "‹name›"*, in the popup's search or its Name form. */
export function thisPagePencil(popup: Page) {
  return popup.locator('.this-page').getByRole('button');
}

/** The confirmation of the last single-line change, and its Undo. */
export function lineConfirmation(page: Page) {
  return { text: page.locator('.confirmation-text'), undo: page.locator('.confirmation').getByRole('button') };
}

// The Text view's kept draft (G19, G21; In use, "Edit the text"; Composition, *draft set*, *draft discard*,
// *replace*; State `draft`): the worker keeps one draft, the most recent unsaved edit, unless the stored one
// is newer, and removes it only on a discard that names it or once a *replace* stored its text; a Text view
// sends what its text area holds as it is typed, coalesced, before Save, and on leaving the view, and discards
// its draft once the stored document holds the text; closed, the popup leaves the draft for the next Text view.
// The offer itself, its answers, and the merge it can lead to are in e2e/text-view-draft-offer.spec.ts.
import type { Draft } from '../src/draft.ts';
import {
  expect,
  holdPageReads,
  holdPageRequests,
  popupOnNewPage,
  refuseWorkerStorage,
  slowWorkerReads,
  storedDraft,
  test,
  textView,
  textViewInPopup,
  textViewOnOptionsPage,
  typeAtEnd,
  watchDraftSets,
  watchRequests,
  type LoadedExtension,
} from './extension.ts';

const DOC = 'a  https://a/\nb  https://b/\n';
const CHANGED = 'Not saved: the stored document changed after this text was loaded, in another view or window. Your text is kept as you typed it.';

/** A draft another Text view kept, as a check seeds it. */
function kept(text: string, base: string, view = 'earlier-view', number = 4, time = 1_700_000_000_000): Draft {
  return { text, base, time, view, number };
}

/** Waits until the draft stored holds `text`. */
async function draftLanded(extension: LoadedExtension, text: string) {
  await expect.poll(async () => (await storedDraft(extension.worker))?.text).toBe(text);
}

async function noDraft(extension: LoadedExtension) {
  await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
}

/** Another page's Save of `text` over `base`, applied. */
async function savedElsewhere(extension: LoadedExtension, base: string, text: string) {
  expect(await extension.sendRequest({ kind: 'replace', text, base })).toMatchObject({ kind: 'applied' });
}

/** Answers every read the page made that `reads` holds, oldest first, once the page has made at least one. */
async function answerReads(reads: { held(): Promise<number>; release(): Promise<void> }) {
  await expect.poll(reads.held).toBeGreaterThan(0);
  while ((await reads.held()) > 0) await reads.release();
}

test('the worker stores a draft set unless the stored draft is newer, the later of the same millisecond kept', async ({ extension }) => {
  const newer = kept('newer', DOC, 'view-y', 2, 2_000);
  await extension.seedStorage({ mappings: DOC, draft: newer });
  const set = (time: number, number: number) => extension.sendRequest({ kind: 'draft-set', text: `typed at ${time}`, base: DOC, time, view: 'view-x', number });
  expect(await set(1_999, 1)).toEqual({ kind: 'done' });
  expect(await storedDraft(extension.worker)).toEqual(newer);
  expect(await set(2_000, 2)).toEqual({ kind: 'done' });
  expect(await storedDraft(extension.worker)).toEqual({ text: 'typed at 2000', base: DOC, time: 2_000, view: 'view-x', number: 2 });
  expect(await set(5_000, 3)).toEqual({ kind: 'done' });
  expect(await storedDraft(extension.worker)).toEqual({ text: 'typed at 5000', base: DOC, time: 5_000, view: 'view-x', number: 3 });
  expect((await extension.readStorage()).mappings).toBe(DOC);
});

test('a draft discard removes the draft only when it names it by both view and number, and writes nothing when there is none', async ({ extension }) => {
  const draft = kept(`${DOC}c  https://c/\n`, DOC, 'view-x', 5);
  await extension.seedStorage({ mappings: DOC, draft });
  const changes = await extension.watchStorage();
  for (const name of [{ view: 'view-x', number: 4 }, { view: 'view-y', number: 5 }]) {
    expect(await extension.sendRequest({ kind: 'draft-discard', ...name })).toEqual({ kind: 'done' });
    expect(await storedDraft(extension.worker)).toEqual(draft);
  }
  expect(await extension.sendRequest({ kind: 'draft-discard', view: 'view-x', number: 5 })).toEqual({ kind: 'done' });
  expect(await storedDraft(extension.worker)).toBeUndefined();
  expect(await extension.sendRequest({ kind: 'draft-discard', view: 'view-x', number: 5 })).toEqual({ kind: 'done' });
  // Every change has reached the worker's listeners once a read made after them is answered.
  await extension.readStorage();
  expect(await changes()).toEqual([{ draft: { oldValue: draft } }]);
});

test('a replace applied removes a draft of the text it stored, after storing it, and leaves a draft of another text', async ({ extension }) => {
  const text = `${DOC}c  https://c/\n`;
  await extension.seedStorage({ mappings: DOC, draft: kept(text, DOC) });
  const changes = await extension.watchStorage();
  expect(await extension.sendRequest({ kind: 'replace', text, base: DOC })).toMatchObject({ kind: 'applied', text });
  expect(await storedDraft(extension.worker)).toBeUndefined();
  await extension.readStorage();
  expect((await changes()).map((change) => Object.keys(change).sort())).toEqual([['mappings', 'usage'], ['draft']]);

  const other = kept(`${DOC}other  https://other/\n`, DOC);
  await extension.seedStorage({ mappings: DOC, draft: other });
  expect(await extension.sendRequest({ kind: 'replace', text, base: DOC })).toMatchObject({ kind: 'applied' });
  expect(await storedDraft(extension.worker)).toEqual(other);
});

test('a replace refused as changed or invalid, or whose write Chrome refuses, leaves the draft of its text', async ({ extension }) => {
  const text = `${DOC}c  https://c/\n`;
  await extension.seedStorage({ mappings: DOC, draft: kept(text, DOC) });
  expect(await extension.sendRequest({ kind: 'replace', text, base: 'a  https://a/\n' })).toEqual({ kind: 'changed', document: DOC });
  expect(await storedDraft(extension.worker)).toEqual(kept(text, DOC));

  const broken = `${DOC}just-a-name\n`;
  await extension.seedStorage({ mappings: DOC, draft: kept(broken, DOC) });
  expect(await extension.sendRequest({ kind: 'replace', text: broken, base: DOC })).toEqual({ kind: 'invalid', line: 3, problem: 'needs-name-and-url' });
  expect(await storedDraft(extension.worker)).toEqual(kept(broken, DOC));

  await extension.seedStorage({ mappings: DOC, draft: kept(text, DOC) });
  await refuseWorkerStorage(extension.worker, 'set', 'IO error: the write was refused');
  expect(await extension.sendRequest({ kind: 'replace', text, base: DOC })).toEqual({ kind: 'storage-failed', message: 'IO error: the write was refused' });
  expect(await extension.readStorage()).toEqual({ mappings: DOC, draft: kept(text, DOC) });
});

test('a Save whose draft Chrome refuses to remove is still applied: the reply says so, and the view says Saved', async ({ extension }) => {
  const text = `${DOC}c  https://c/\n`;
  await extension.seedStorage({ mappings: DOC, draft: kept(text, DOC) });
  await refuseWorkerStorage(extension.worker, 'remove', 'IO error: the removal was refused');
  expect(await extension.sendRequest({ kind: 'replace', text, base: DOC })).toMatchObject({ kind: 'applied', text });
  expect((await extension.readStorage()).mappings).toBe(text);

  await extension.seedStorage({ mappings: DOC });
  const view = await textViewOnOptionsPage(extension);
  const typed = `${DOC}d  https://d/\n`;
  await typeAtEnd(view, 'd  https://d/\n');
  await draftLanded(extension, typed);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(typed);
});

test("typed in the popup's Text view, the draft is stored with its base, the edit's time, and a view and number; closed, the popup leaves it, and the next Text view in either host offers it", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { page, popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  const before = Date.now();
  await typeAtEnd(view, 'c  https://c/');
  const after = Date.now();
  const text = `${DOC}c  https://c/`;
  await draftLanded(extension, text);
  await popup.close();
  const draft = await storedDraft(extension.worker);
  expect(draft).toEqual({ text, base: DOC, time: expect.any(Number), view: expect.any(String), number: expect.any(Number) });
  expect(draft!.time).toBeGreaterThanOrEqual(before);
  expect(draft!.time).toBeLessThanOrEqual(after);
  expect(draft!.view).not.toBe('');
  expect(draft!.number).toBeGreaterThanOrEqual(1);

  const next = await textViewInPopup(await extension.clickToolbarButton(page), 'offering');
  // While the offer stands the text area shows the stored document.
  await expect(next.area).toHaveValue(DOC);
  await expect(next.keptOffer).toContainText('was not saved');
  const options = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await expect(options.area).toHaveValue(DOC);
  expect(await storedDraft(extension.worker)).toEqual(draft);
});

test('leaving the Text view by Back or for Preferences within 300 ms of the last keystroke keeps it, and the Text view opened again at once offers it', async ({ extension, site }) => {
  // The last draft set lands a second after the view is left, well after it is opened again.
  await slowWorkerReads(extension.worker, 'draft', 1_000);
  for (const leave of ['Back', 'Preferences'] as const) {
    await extension.seedStorage({ mappings: DOC });
    const { page, popup } = await popupOnNewPage(extension, site);
    const view = await textViewInPopup(popup);
    await typeAtEnd(view, 'xy');
    if (leave === 'Back') await popup.getByRole('button', { name: 'Back' }).click();
    else await popup.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Preferences' }).click();
    // Opened again at once, it reads the draft only once the one it left has landed.
    const again =
      leave === 'Back'
        ? await textViewInPopup(popup, 'offering')
        : await (async () => {
            await popup.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Text' }).click();
            await expect(textView(popup).keptOffer).toBeVisible();
            return textView(popup);
          })();
    expect((await storedDraft(extension.worker))?.text, leave).toBe(`${DOC}xy`);
    await again.resume.click();
    await expect(again.area, leave).toHaveValue(`${DOC}xy`);
    await popup.close();
    await page.close();
  }
});

test('closing the options page within 300 ms of the last keystroke keeps it', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'xy');
  await view.page.close();
  await draftLanded(extension, `${DOC}xy`);
});

test('while a draft set awaits its reply the view sends no other, and the last keystroke still lands', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const view = await textViewOnOptionsPage(extension);
  await slowWorkerReads(extension.worker, 'draft', 1_000);
  const sets = await watchDraftSets(extension.worker);
  const typed = '0123456789012345678901234567890';
  await typeAtEnd(view, '');
  await view.page.keyboard.type(typed, { delay: 100 });
  await expect.poll(async () => (await storedDraft(extension.worker))?.text, { timeout: 10_000 }).toBe(DOC + typed);
  const { received, stored } = await sets();
  // Sent every 300 ms without waiting, over three seconds of typing, there would be ten.
  expect(received.length).toBeGreaterThan(1);
  expect(received.length).toBeLessThan(7);
  expect(stored).toHaveLength(received.length);
  for (let next = 1; next < received.length; next++) expect(received[next]).toBeGreaterThanOrEqual(stored[next - 1]!);
});

test('each Text view opened writes its drafts under an identifier of its own', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const ids: string[] = [];
  const first = await textViewOnOptionsPage(extension);
  await typeAtEnd(first, 'one  https://one/\n');
  await draftLanded(extension, `${DOC}one  https://one/\n`);
  ids.push((await storedDraft(extension.worker))!.view);
  await first.page.close();
  const second = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await second.discard.click();
  await typeAtEnd(second, 'two  https://two/\n');
  await draftLanded(extension, `${DOC}two  https://two/\n`);
  ids.push((await storedDraft(extension.worker))!.view);
  // Opened before the popup, which a tab opened later can close.
  const { popup } = await popupOnNewPage(extension, site);
  const third = await textViewInPopup(popup, 'offering');
  await third.discard.click();
  await typeAtEnd(third, 'three  https://three/\n');
  await draftLanded(extension, `${DOC}three  https://three/\n`);
  ids.push((await storedDraft(extension.worker))!.view);
  expect(new Set(ids).size).toBe(3);
});

test('typed back to the stored document, the draft goes; on a CRLF document the text area\'s LF text is a change, and stays', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const view = await textViewOnOptionsPage(extension);
  const line = 'c  https://c/\n';
  await typeAtEnd(view, line);
  await draftLanded(extension, DOC + line);
  for (let at = 0; at < line.length; at++) await view.page.keyboard.press('Backspace');
  await expect(view.area).toHaveValue(DOC);
  await noDraft(extension);
  await view.page.close();

  const crlf = DOC.replaceAll('\n', '\r\n');
  await extension.seedStorage({ mappings: crlf });
  const onCrlf = await textViewOnOptionsPage(extension);
  await typeAtEnd(onCrlf, 'x');
  await draftLanded(extension, `${DOC}x`);
  await onCrlf.page.keyboard.press('Backspace');
  await draftLanded(extension, DOC);
  expect(await storedDraft(extension.worker)).toMatchObject({ text: DOC, base: crlf });
});

test('a read answered after a later one was made, showing a document since changed again, never discards the unsaved text it seems to hold', async ({ extension }) => {
  const one = `${DOC}one  https://one/\n`;
  const two = `${one}two  https://two/\n`;
  await extension.seedStorage({ mappings: DOC });
  const view = await textViewOnOptionsPage(extension);
  const reads = await holdPageReads(view.page);
  expect(await extension.sendRequest({ kind: 'replace', text: one, base: DOC })).toMatchObject({ kind: 'applied' });
  await expect.poll(reads.held).toBe(1);
  expect(await extension.sendRequest({ kind: 'replace', text: two, base: one })).toMatchObject({ kind: 'applied' });
  await expect.poll(reads.held).toBe(2);
  // Typed once the document is already `two`: the text `one` is an unsaved change.
  await view.area.fill(one);
  await draftLanded(extension, one);
  const typed = (await storedDraft(extension.worker))!;
  const discards = await watchRequests(extension.worker, 'draft-discard');
  await reads.release();
  await reads.release();
  await expect.poll(reads.held).toBe(0);
  // Time for a discard, had the late answer sent one, to reach the worker.
  await view.page.waitForTimeout(300);
  await expect(view.area).toHaveValue(one);
  expect(await discards()).toEqual([]);
  expect(await storedDraft(extension.worker)).toEqual(typed);
  expect((await extension.readStorage()).mappings).toBe(two);
  await view.page.close();
  await textViewOnOptionsPage(extension, '#view=text', 'offering');
});

test('a Save applied leaves no draft, and the next Text view offers none', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { page, popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await typeAtEnd(view, 'c  https://c/\n');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  await noDraft(extension);
  await popup.close();
  await textViewInPopup(await extension.clickToolbarButton(page));
  expect((await extension.readStorage()).mappings).toBe(`${DOC}c  https://c/\n`);
});

test('a Save applied keeps no draft of its text even when another page changes the document before the view lets the draft go: the view left before reading that change, the next Text view offers none', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  // The other page's request page, opened first.
  await extension.sendRequest({ kind: 'reset-usage' });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'c  https://c/\n');
  const saved = `${DOC}c  https://c/\n`;
  await draftLanded(extension, saved);
  const reads = await holdPageReads(view.page);
  const discards = await holdPageRequests(view.page, 'draft-discard');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  await noDraft(extension);
  // The view's reads of the document it saved are answered; its discard of its draft is sent late, after another
  // page's change, and the view's read of that change is answered only after the view is left.
  while ((await reads.held()) > 0) await reads.release();
  await expect.poll(discards.held).toBe(1);
  expect(await extension.sendRequest({ kind: 'insert', name: 'other', url: 'https://other/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
  await expect.poll(reads.held).toBe(1);
  await discards.release();
  const nav = view.page.getByRole('navigation', { name: 'Settings views' });
  await nav.getByRole('button', { name: 'Preferences', exact: true }).click();
  await nav.getByRole('button', { name: 'Text', exact: true }).click();
  // Shown again, the Text view reads once the page's draft requests have their replies; every read is answered.
  await expect
    .poll(async () => {
      while ((await reads.held()) > 0) await reads.release();
      return (await view.keptOffer.count()) > 0 || (await view.area.isEditable());
    })
    .toBe(true);
  await expect(view.area).toHaveValue(`${saved}other https://other/\n`);
  await expect(view.keptOffer).toHaveCount(0);
  await expect(view.area).toBeEditable();
  expect(await storedDraft(extension.worker)).toBeUndefined();
});

test("a Save's discard of its view's draft, reaching the worker after another page typed, leaves that page's newer draft", async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const view = await textViewOnOptionsPage(extension);
  const other = await textViewOnOptionsPage(extension);
  const saved = `${DOC}x  https://x/\n`;
  await view.area.fill(saved);
  await draftLanded(extension, saved);
  const own = (await storedDraft(extension.worker))!;
  const discards = await holdPageRequests(view.page, 'draft-discard');
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  await expect.poll(discards.held).toBe(1);
  await noDraft(extension);
  await expect(other.area).toHaveValue(saved);
  await typeAtEnd(other, 'y  https://y/\n');
  await draftLanded(extension, `${saved}y  https://y/\n`);
  const newer = (await storedDraft(extension.worker))!;
  const received = await watchRequests(extension.worker, 'draft-discard');
  await discards.release();
  await expect.poll(received).toEqual([{ kind: 'draft-discard', view: own.view, number: own.number }]);
  // Queued after the discard, so the worker has performed it.
  await extension.sendRequest({ kind: 'reset-usage' });
  expect(await storedDraft(extension.worker)).toEqual(newer);
});

test('a text another page saved after it was typed is no unsaved edit: changed again before the view lets its draft go, it is not kept again, and the view shown again offers none', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  // The other page's request page, opened first.
  await extension.sendRequest({ kind: 'reset-usage' });
  const view = await textViewOnOptionsPage(extension);
  const other = await textViewOnOptionsPage(extension);
  const typed = `${DOC}x  https://x/\n`;
  await view.area.fill(typed);
  await draftLanded(extension, typed);
  const reads = await holdPageReads(view.page);
  const discards = await holdPageRequests(view.page, 'draft-discard');
  await other.area.fill(typed);
  await other.save.click();
  await expect(other.status).toHaveText('Saved');
  await noDraft(extension);
  // The view reads the document holding its text and lets its draft go; that discard is sent late, after a
  // further change, and the view's read of that change is answered only after the view is left.
  await expect.poll(reads.held).toBe(1);
  await reads.release();
  await expect.poll(discards.held).toBe(1);
  expect(await extension.sendRequest({ kind: 'insert', name: 'other', url: 'https://other/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
  await expect.poll(reads.held).toBe(1);
  await discards.release();
  const nav = view.page.getByRole('navigation', { name: 'Settings views' });
  await nav.getByRole('button', { name: 'Preferences', exact: true }).click();
  await nav.getByRole('button', { name: 'Text', exact: true }).click();
  await expect
    .poll(async () => {
      while ((await reads.held()) > 0) await reads.release();
      return (await view.keptOffer.count()) > 0 || (await view.area.isEditable());
    })
    .toBe(true);
  await expect(view.area).toHaveValue(`${typed}other https://other/\n`);
  await expect(view.keptOffer).toHaveCount(0);
  await expect(view.area).toBeEditable();
  expect(await storedDraft(extension.worker)).toBeUndefined();
});

test('an edit made after another page changed the document, equal to the document as the view last read it, is still kept: closed, the next Text view offers it', async ({ extension }) => {
  const x = `${DOC}x  https://x/\n`;
  const t = `${DOC}t  https://t/\n`;
  const u = `${DOC}u  https://u/\n`;
  await extension.seedStorage({ mappings: DOC });
  // The other page's request page, opened first.
  await extension.sendRequest({ kind: 'reset-usage' });
  const view = await textViewOnOptionsPage(extension);
  await view.area.fill(x);
  await draftLanded(extension, x);
  const reads = await holdPageReads(view.page);
  // Other pages store the view's text, then t; the view reads each, its text and base as they were.
  await savedElsewhere(extension, DOC, x);
  await noDraft(extension);
  await answerReads(reads);
  await savedElsewhere(extension, x, t);
  await answerReads(reads);
  await expect(view.area).toHaveValue(x);
  // A further change, u, which the view reads late; meanwhile the user makes the text t, typed after u was stored.
  await savedElsewhere(extension, t, u);
  await expect.poll(reads.held).toBe(1);
  await view.area.fill(t);
  await draftLanded(extension, t);
  expect(await storedDraft(extension.worker)).toMatchObject({ text: t, base: DOC });
  await view.page.close();
  const next = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await expect(next.area).toHaveValue(u);
  await next.resume.click();
  await expect(next.area).toHaveValue(t);
});

test("a text another page saved after it was typed is no unsaved edit, though the view's discard of its earlier draft is still on its way: changed again, it is not kept again", async ({ extension }) => {
  const x = `${DOC}x  https://x/\n`;
  const t = `${DOC}t  https://t/\n`;
  const u = `${DOC}u  https://u/\n`;
  const v = `${DOC}v  https://v/\n`;
  await extension.seedStorage({ mappings: DOC });
  // The other page's request page, opened first.
  await extension.sendRequest({ kind: 'reset-usage' });
  const view = await textViewOnOptionsPage(extension);
  await view.area.fill(x);
  await draftLanded(extension, x);
  const reads = await holdPageReads(view.page);
  await savedElsewhere(extension, DOC, t);
  await answerReads(reads);
  // The user makes the text t, the document as the view read it; the view's discards are sent late.
  const discards = await holdPageRequests(view.page, 'draft-discard');
  await view.area.fill(t);
  // Other pages store u, then t again, a Save of the view's text after it was typed, then v.
  await savedElsewhere(extension, t, u);
  await savedElsewhere(extension, u, t);
  await answerReads(reads);
  await savedElsewhere(extension, t, v);
  await answerReads(reads);
  while ((await discards.held()) > 0) await discards.release();
  await noDraft(extension);
  // Time for a draft set, had the view kept the text again, to reach the worker.
  await view.page.waitForTimeout(400);
  expect(await storedDraft(extension.worker)).toBeUndefined();
  await view.page.close();
  const next = await textViewOnOptionsPage(extension);
  await expect(next.area).toHaveValue(v);
  await expect(next.keptOffer).toHaveCount(0);
});

test('a text another page saved after it was typed, which the view held no draft of, is not kept when the document changes again', async ({ extension }) => {
  const x = `${DOC}x  https://x/\n`;
  const t = `${DOC}t  https://t/\n`;
  const u = `${DOC}u  https://u/\n`;
  const v = `${DOC}v  https://v/\n`;
  await extension.seedStorage({ mappings: DOC });
  // The other page's request page, opened first.
  await extension.sendRequest({ kind: 'reset-usage' });
  const view = await textViewOnOptionsPage(extension);
  await view.area.fill(x);
  await draftLanded(extension, x);
  const reads = await holdPageReads(view.page);
  // Another page saves the view's text, which lets its draft go, then t.
  await savedElsewhere(extension, DOC, x);
  await answerReads(reads);
  await noDraft(extension);
  await savedElsewhere(extension, x, t);
  await answerReads(reads);
  // The user makes the text t, the document as the view read it; any read the view makes of it is then answered.
  await view.area.fill(t);
  await view.page.waitForTimeout(400);
  while ((await reads.held()) > 0) await reads.release();
  await noDraft(extension);
  // Other pages store u, then t again, a Save of the view's text after it was typed; the view reads u late, then v.
  await savedElsewhere(extension, t, u);
  await expect.poll(reads.held).toBe(1);
  await savedElsewhere(extension, u, t);
  await answerReads(reads);
  await savedElsewhere(extension, t, v);
  await answerReads(reads);
  // Time for a draft set, had the view kept the text again, to reach the worker.
  await view.page.waitForTimeout(400);
  expect(await storedDraft(extension.worker)).toBeUndefined();
  await view.page.close();
  const next = await textViewOnOptionsPage(extension);
  await expect(next.area).toHaveValue(v);
  await expect(next.keptOffer).toHaveCount(0);
});

test("a draft set sent late, of a text another page saved after it was typed, goes, though the view's read of that save is answered after a later one was made", async ({ extension }) => {
  const x = `${DOC}x  https://x/\n`;
  const u = `${DOC}u  https://u/\n`;
  await extension.seedStorage({ mappings: DOC });
  // The other page's request page, opened first.
  await extension.sendRequest({ kind: 'reset-usage' });
  const view = await textViewOnOptionsPage(extension);
  const sets = await holdPageRequests(view.page, 'draft-set');
  const reads = await holdPageReads(view.page);
  await view.area.fill(x);
  await expect.poll(sets.held).toBe(1);
  // Another page saves the view's text, then u; the view reads both, the read of x answered after u's was made.
  await savedElsewhere(extension, DOC, x);
  await expect.poll(reads.held).toBe(1);
  await savedElsewhere(extension, x, u);
  await expect.poll(reads.held).toBe(2);
  await answerReads(reads);
  await sets.release();
  await noDraft(extension);
  // Time for a draft set, had the view kept the text again, to reach the worker.
  await view.page.waitForTimeout(400);
  expect(await storedDraft(extension.worker)).toBeUndefined();
  await view.page.close();
  const next = await textViewOnOptionsPage(extension);
  await expect(next.area).toHaveValue(u);
  await expect(next.keptOffer).toHaveCount(0);
});

test('a Save made within 300 ms of the last keystroke and cut short by the popup closing leaves the submitted text kept, with its old base, for the next Text view', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  // Opened before the popup, which a tab opened later can close.
  const other = await extension.openRequestPage();
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await typeAtEnd(view, 'x  https://x/\n');
  expect(await other.send({ kind: 'insert', name: 'other', url: 'https://other.example/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
  const changed = (await extension.readStorage()).mappings;
  await slowWorkerReads(extension.worker, 'mappings', 2_000);
  const replaces = await watchRequests(extension.worker, 'replace');
  await typeAtEnd(view, 'y  https://y/\n');
  await view.save.click();
  await expect.poll(replaces).toHaveLength(1);
  await popup.close();
  const submitted = `${DOC}x  https://x/\ny  https://y/\n`;
  expect(await replaces()).toEqual([{ kind: 'replace', text: submitted, base: DOC }]);
  // Refused, as the document changed under the typing: nothing stored, and the draft is the text submitted.
  const next = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  expect((await extension.readStorage()).mappings).toBe(changed);
  expect(await storedDraft(extension.worker)).toMatchObject({ text: submitted, base: DOC });
  await next.resume.click();
  await expect(next.area).toHaveValue(submitted);
  await next.save.click();
  await expect(next.status).toHaveText(CHANGED);
});

test('a draft set Chrome refuses says the draft is not kept, keeps the typing, and leaves what Save says to Save', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await extension.fillStorage(50);
  const long = `long  https://long.example/${'x'.repeat(200)}\n`;
  await typeAtEnd(view, long);
  await expect(view.notKept).toHaveText(/^Your unsaved text is not kept for later, so it is lost if this view closes; it is still here to save\. Chrome said: .*quota/i);
  await expect(view.area).toHaveValue(DOC + long);
  await expect(view.status).toHaveText('');
  expect(await storedDraft(extension.worker)).toBeUndefined();
  await view.save.click();
  await expect(view.status).toHaveText(/^Not saved: your text is kept as you typed it\. Chrome said: .*quota/i);
  await expect(view.notKept).toBeVisible();
  await expect(view.area).toHaveValue(DOC + long);
  expect((await extension.readStorage()).mappings).toBe(DOC);

  // With room again, the next change is kept, and Save stores.
  await extension.worker.evaluate(() => chrome.storage.local.remove('storageFiller'));
  await typeAtEnd(view, 'z  https://z/\n');
  await draftLanded(extension, `${DOC}${long}z  https://z/\n`);
  await expect(view.notKept).toHaveCount(0);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  await noDraft(extension);
});

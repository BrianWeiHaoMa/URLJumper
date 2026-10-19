// The offer of a kept draft as a Text view opens (G19, G18, G7, G32, L2; In use, "Edit the text"): a draft
// another Text view kept is offered, to resume, its text and its base restored, or to discard, and a draft the
// stored document holds is dropped without asking; a discard, of the offer or once the text is the stored
// document again, names the draft it removes; the offer follows the draft in storage while it stands; a
// resumed draft over a document changed since reaches the merge and overwrites nothing; and the offer's states
// fit the popup and pass the accessibility pass, with the keyboard alone answering it.
import type { Page } from '@playwright/test';
import type { Draft } from '../src/draft.ts';
import {
  caret,
  checkAccessibilityInBothSchemes,
  checkFitAndAccessibility,
  draftLanded,
  expect,
  holdPageReads,
  holdPageRequests,
  popupOnNewPage,
  storedDraft,
  test,
  textView,
  textViewInPopup,
  textViewOnOptionsPage,
  typeAtEnd,
  watchRequests,
} from './extension.ts';

const DOC = 'a  https://a/\nb  https://b/\n';
const CHANGED = 'Not saved: the stored document changed after this text was loaded, in another view or window. Your text is kept as you typed it.';
const MERGED = "The stored document's change is in your text. It is not stored until you save.";

const footer = (popup: Page) => popup.locator('footer');

/** A draft another Text view kept, as a check seeds it. */
function kept(text: string, base: string, view = 'earlier-view', number = 4, time = 1_700_000_000_000): Draft {
  return { text, base, time, view, number };
}

test('a kept draft offered and discarded goes; resumed, then made the stored text again by one input, it goes; each discard names the view and number that wrote it', async ({ extension }) => {
  const draft = kept(`${DOC}c  https://c/\n`, DOC, 'view-x', 7);
  await extension.seedStorage({ mappings: DOC, draft });
  const discards = await watchRequests(extension.worker, 'draft-discard');
  const first = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await first.discard.click();
  await expect(first.keptOffer).toHaveCount(0);
  await expect(first.area).toBeEditable();
  await expect(first.area).toHaveValue(DOC);
  await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
  expect(await discards()).toEqual([{ kind: 'draft-discard', view: 'view-x', number: 7 }]);
  await first.page.close();

  await extension.seedStorage({ mappings: DOC, draft });
  const second = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await second.resume.click();
  await expect(second.keptOffer).toHaveCount(0);
  await expect(second.area).toHaveValue(draft.text);
  await expect(second.area).toBeFocused();
  // Resuming writes nothing.
  expect(await storedDraft(extension.worker)).toEqual(draft);
  await second.area.fill(DOC);
  await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
  expect((await discards()).slice(1)).toEqual([{ kind: 'draft-discard', view: 'view-x', number: 7 }]);
  expect((await extension.readStorage()).mappings).toBe(DOC);
});

test('a kept draft the stored document holds is dropped as the view opens, without asking, named by its view and number', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC, draft: kept(DOC, 'a  https://a/\n', 'view-x', 3) });
  const discards = await watchRequests(extension.worker, 'draft-discard');
  const view = await textViewOnOptionsPage(extension);
  await expect(view.area).toHaveValue(DOC);
  await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
  expect(await discards()).toEqual([{ kind: 'draft-discard', view: 'view-x', number: 3 }]);
});

test('a kept draft found equal to the stored document as the view opens is dropped, though another page changes the document before the drop reaches the worker', async ({ extension }) => {
  const text = `${DOC}c  https://c/\n`;
  await extension.seedStorage({ mappings: text, draft: kept(text, DOC, 'view-x', 3) });
  // The other page's request page, opened first.
  await extension.sendRequest({ kind: 'reset-usage' });
  const page = await extension.context.newPage();
  await page.goto(extension.url('options.html#view=preferences'));
  const discards = await holdPageRequests(page, 'draft-discard');
  await page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Text', exact: true }).click();
  const view = textView(page);
  await expect.poll(discards.held).toBe(1);
  expect(await extension.sendRequest({ kind: 'insert', name: 'other', url: 'https://other/', note: '', heading: null })).toMatchObject({ kind: 'applied' });
  await discards.release();
  await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
  await expect(view.area).toHaveValue(`${text}other https://other/\n`);
  await expect(view.keptOffer).toHaveCount(0);
  await expect(view.area).toBeEditable();
});

test("on a CRLF document a kept draft of the text area's LF text is a change, offered and not dropped", async ({ extension }) => {
  const crlf = DOC.replaceAll('\n', '\r\n');
  const draft = kept(DOC, crlf);
  await extension.seedStorage({ mappings: crlf, draft });
  const view = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  // Time for a discard, had one been sent as the view opened, to land.
  await view.page.waitForTimeout(300);
  expect(await storedDraft(extension.worker)).toEqual(draft);
  await view.resume.click();
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(DOC);
});

test('a resumed draft typed before another page changed the document has its own base: Save is refused and offers the change, nothing overwritten; brought in, Save stores both', async ({ extension }) => {
  const changed = `${DOC}other  https://other/\n`;
  const draft = kept(`a  https://a/\nb  https://b/\nmine  https://mine/\n`, DOC);
  await extension.seedStorage({ mappings: changed, draft });
  const view = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await expect(view.keptOffer).toContainText('The stored document has changed since it was typed');
  await view.resume.click();
  await expect(view.area).toHaveValue(draft.text);
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  await expect(view.offer).toBeVisible();
  expect((await extension.readStorage()).mappings).toBe(changed);
  await view.bringIn.click();
  const merged = `${changed}mine  https://mine/\n`;
  await expect(view.area).toHaveValue(merged);
  await view.save.click();
  await expect(view.status).toHaveText('Saved');
  expect((await extension.readStorage()).mappings).toBe(merged);
});

test('a change brought in keeps the draft with the stored text as its base, even when the text is as it was: resumed later, it saves with no second merge', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const view = await textViewOnOptionsPage(extension);
  await typeAtEnd(view, 'c  https://c/\nd  https://d/\n');
  const typed = `${DOC}c  https://c/\nd  https://d/\n`;
  await draftLanded(extension, typed);
  // Another page makes one of the two changes the draft made.
  const stored = `${DOC}c  https://c/\n`;
  expect(await extension.sendRequest({ kind: 'replace', text: stored, base: DOC })).toMatchObject({ kind: 'applied' });
  await view.save.click();
  await expect(view.status).toHaveText(CHANGED);
  await view.bringIn.click();
  await expect(view.status).toHaveText(MERGED);
  await expect(view.area).toHaveValue(typed);
  await expect.poll(async () => (await storedDraft(extension.worker))?.base).toBe(stored);
  expect((await storedDraft(extension.worker))?.text).toBe(typed);
  await view.page.close();

  const again = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await again.resume.click();
  await again.save.click();
  await expect(again.status).toHaveText('Saved');
  await expect(again.offer).toHaveCount(0);
  expect((await extension.readStorage()).mappings).toBe(typed);
});

test("of two Text views the newer edit is kept, and one view's discard removes only its own draft", async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC });
  const a = await textViewOnOptionsPage(extension);
  await typeAtEnd(a, 'from-a  https://a.example/\n');
  await draftLanded(extension, `${DOC}from-a  https://a.example/\n`);
  const ofA = (await storedDraft(extension.worker))!;
  const b = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await b.resume.click();
  await typeAtEnd(b, 'from-b  https://b.example/\n');
  const typedInB = `${DOC}from-a  https://a.example/\nfrom-b  https://b.example/\n`;
  await draftLanded(extension, typedInB);
  const ofB = (await storedDraft(extension.worker))!;
  expect(ofB.view).not.toBe(ofA.view);
  expect(ofB.base).toBe(DOC);

  const discards = await watchRequests(extension.worker, 'draft-discard');
  await a.area.fill(DOC);
  await expect.poll(discards).toEqual([{ kind: 'draft-discard', view: ofA.view, number: ofA.number }]);
  expect(await storedDraft(extension.worker)).toEqual(ofB);
});

test('the offer follows the draft in storage: of a newer draft once one is kept, and withdrawn, the stored document shown, once another page saves its text', async ({ extension }) => {
  const draft = kept(`${DOC}c  https://c/\n`, DOC, 'view-x', 2);
  await extension.seedStorage({ mappings: DOC, draft });
  const view = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  // Typed a day later, so the offer says another time.
  const newer = kept(`${DOC}c  https://c/\nd  https://d/\n`, DOC, 'view-x', 3, draft.time + 86_400_000);
  expect(await extension.sendRequest({ kind: 'draft-set', ...newer })).toEqual({ kind: 'done' });
  expect(await extension.sendRequest({ kind: 'replace', text: newer.text, base: DOC })).toMatchObject({ kind: 'applied' });
  await expect(view.keptOffer).toHaveCount(0);
  await expect(view.area).toHaveValue(newer.text);
  await expect(view.area).toBeEditable();
  await expect(view.area).toBeFocused();
  expect(await storedDraft(extension.worker)).toBeUndefined();

  // A newer draft while the offer stands is the one offered, and the one resumed.
  await extension.seedStorage({ mappings: DOC, draft });
  const next = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  const offered = (await next.keptOffer.textContent())!;
  expect(await extension.sendRequest({ kind: 'draft-set', ...newer })).toEqual({ kind: 'done' });
  await expect(next.keptOffer).not.toHaveText(offered);
  await next.resume.click();
  await expect(next.area).toHaveValue(newer.text);
});

test('a Text view whose first read is answered after another view stored a newer draft offers the newer one', async ({ extension }) => {
  const old = kept(`${DOC}old  https://old/\n`, DOC);
  const newer = `${DOC}new  https://new/\n`;
  await extension.seedStorage({ mappings: DOC, draft: old });
  const writer = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await writer.resume.click();
  const page = await extension.context.newPage();
  await page.goto(extension.url('options.html'));
  const reads = await holdPageReads(page);
  await page.getByRole('navigation', { name: 'Settings views' }).getByRole('button', { name: 'Text' }).click();
  await expect.poll(reads.held).toBe(1);
  await writer.area.fill(newer);
  await draftLanded(extension, newer);
  // The change to the draft makes the view read again.
  await expect.poll(reads.held).toBe(2);
  while ((await reads.held()) > 0) await reads.release();
  const view = textView(page);
  await expect(view.keptOffer).toBeVisible();
  await view.resume.click();
  await expect(view.area).toHaveValue(newer);
});

test('a Discard that reaches the worker after a newer draft leaves the offer of the newer one standing', async ({ extension }) => {
  const old = kept(`${DOC}old  https://old/\n`, DOC);
  const newer = kept(`${DOC}new  https://new/\n`, DOC, 'other-view', 9, old.time + 86_400_000);
  await extension.seedStorage({ mappings: DOC, draft: old });
  const view = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  const late = await holdPageRequests(view.page, 'draft-discard');
  const received = await watchRequests(extension.worker, 'draft-discard');
  const offered = (await view.keptOffer.textContent())!;
  await view.discard.click();
  await expect.poll(late.held).toBe(1);
  expect(await extension.sendRequest({ kind: 'draft-set', ...newer })).toEqual({ kind: 'done' });
  await expect(view.keptOffer).not.toHaveText(offered);
  await late.release();
  await expect.poll(received).toHaveLength(1);
  // Time for the reply, which removed nothing, to reach the view.
  await view.page.waitForTimeout(300);
  await expect(view.keptOffer).toBeVisible();
  expect(await storedDraft(extension.worker)).toEqual(newer);
  await view.resume.click();
  await expect(view.area).toHaveValue(newer.text);
});

test('on the options page opened on a line, the offer has the focus; answered, the caret goes to that line of the text shown', async ({ extension }) => {
  const draft = kept('x  https://x/\ny  https://y/\nz  https://z/\n', DOC);
  for (const answer of ['resume', 'discard'] as const) {
    await extension.seedStorage({ mappings: DOC, draft });
    const view = await textViewOnOptionsPage(extension, '#view=text&line=2', 'offering');
    await expect(view.resume).toBeFocused();
    await view[answer].click();
    await expect(view.area).toHaveValue(answer === 'resume' ? draft.text : DOC);
    expect(await caret(view.area), answer).toMatchObject({ focused: true, line: 2, atLineStart: true });
    await view.page.close();
  }
});

test("in the popup the offer fits and passes the accessibility pass; the keyboard alone answers it, with the footer true at each control and over the text area", async ({ extension, site }) => {
  const draft = kept(`${DOC}c  https://c/\n`, DOC);
  await extension.seedStorage({ mappings: DOC, draft });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup, 'offering');
  await expect(view.resume).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter resumes the unsaved text');
  await checkFitAndAccessibility(popup);
  await popup.keyboard.press('Tab');
  await expect(view.discard).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter discards the unsaved text');
  await popup.keyboard.press('Tab');
  await expect(view.area).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter does nothing until the unsaved text is resumed or discarded');
  await popup.keyboard.type('zz');
  await expect(view.area).toHaveValue(DOC);
  await popup.keyboard.press('Tab');
  await expect(view.save).toBeFocused();
  await expect(footer(popup)).toHaveText('Enter does nothing until the unsaved text is resumed or discarded');
  await popup.keyboard.press('Enter');
  await expect(view.status).toHaveText('');
  await popup.keyboard.press('Shift+Tab');
  await popup.keyboard.press('Shift+Tab');
  await popup.keyboard.press('Shift+Tab');
  await expect(view.resume).toBeFocused();
  await popup.keyboard.press('Enter');
  await expect(view.area).toBeFocused();
  await expect(view.area).toHaveValue(draft.text);
  await expect(footer(popup)).toHaveText('Enter starts a new line');
  await checkFitAndAccessibility(popup);
  expect((await extension.readStorage()).mappings).toBe(DOC);
});

test('in the popup the keyboard alone discards the offer, and the stored document is then editable', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC, draft: kept(`${DOC}c  https://c/\n`, DOC) });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup, 'offering');
  await popup.keyboard.press('Tab');
  await popup.keyboard.press('Enter');
  await expect(view.keptOffer).toHaveCount(0);
  await expect(view.area).toBeFocused();
  await expect(view.area).toBeEditable();
  await expect(footer(popup)).toHaveText('Enter starts a new line');
  await expect.poll(() => storedDraft(extension.worker)).toBeUndefined();
});

test('in the popup the not-kept message fits and passes the accessibility pass', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: DOC });
  const { popup } = await popupOnNewPage(extension, site);
  const view = await textViewInPopup(popup);
  await extension.fillStorage(50);
  await typeAtEnd(view, `long  https://long.example/${'x'.repeat(200)}\n`);
  await expect(view.notKept).toBeVisible();
  await checkFitAndAccessibility(popup);
});

test('on the options page the offer and the resumed draft pass the accessibility pass in both schemes', async ({ extension }) => {
  await extension.seedStorage({ mappings: DOC, draft: kept(`${DOC}c  https://c/\n`, DOC) });
  const view = await textViewOnOptionsPage(extension, '#view=text', 'offering');
  await checkAccessibilityInBothSchemes(view.page);
  await view.resume.click();
  await checkAccessibilityInBothSchemes(view.page);
});

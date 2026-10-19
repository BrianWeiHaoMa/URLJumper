// The accessibility pass itself (G32): each failure it exists for, planted in the real popup, fails it for
// that reason alone.
import type { Page } from '@playwright/test';
import { checkAccessibility, expect, popupOnNewPage, test } from './extension.ts';

// Adds `element` to the popup for one check, then removes it.
async function planted(popup: Page, plant: () => void) {
  await popup.evaluate(plant);
  try {
    return await checkAccessibility(popup).then(
      () => 'passed',
      (error: Error) => error.message,
    );
  } finally {
    await popup.evaluate(() => document.getElementById('planted')?.remove());
  }
}

test('the pass fails on an unnamed control, on text below 4.5:1 at any size, on focus drawn nowhere, and on a control Tab never reaches', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await expect(popup.getByRole('option')).toHaveCount(1);
  await checkAccessibility(popup);

  const unnamed = await planted(popup, () => {
    const button = document.createElement('button');
    button.id = 'planted';
    button.append(document.createElement('span'));
    document.body.append(button);
  });
  expect(unnamed).toMatch(/^accessibility problems:\nbutton-name: #planted: [^\n]*$/);

  const faint = await planted(popup, () => {
    const text = document.createElement('p');
    text.id = 'planted';
    text.textContent = 'Faint text';
    text.style.color = 'rgb(160, 160, 160)';
    document.body.append(text);
  });
  expect(faint).toMatch(/^accessibility problems:\ncolor-contrast: #planted: [^\n]*$/);

  // Large text axe accepts at 3:1; G32 asks 4.5:1 of all text.
  const large = await planted(popup, () => {
    const text = document.createElement('p');
    text.id = 'planted';
    text.textContent = 'Large text';
    text.style.fontSize = '32px';
    text.style.color = 'rgb(130, 130, 130)';
    document.body.append(text);
  });
  expect(large).toMatch(/^accessibility problems:\ncolor-contrast: #planted: 3\.\d+:1 is below 4\.5:1$/);

  const unringed = await planted(popup, () => {
    const button = document.createElement('button');
    button.id = 'planted';
    button.textContent = 'Unringed';
    button.style.outline = 'none';
    document.body.append(button);
  });
  expect(unringed).toBe('accessibility problems:\nfocus not visible: button "Unringed"');

  // A control the keyboard cannot reach, such as the chip taken out of the Tab order.
  await popup.locator('.chip').evaluate((chip) => ((chip as HTMLElement).tabIndex = -1));
  expect(await checkAccessibility(popup).then(() => 'passed', (error: Error) => error.message)).toMatch(
    /^accessibility problems:\nfocus never reached by Tab: button "New tab mode; activate to switch to This tab"$/,
  );
  await popup.locator('.chip').evaluate((chip) => ((chip as HTMLElement).tabIndex = 0));

  // The popup is as it was: the pass passes, with the typing still where it was.
  await popup.keyboard.type('ma');
  await checkAccessibility(popup);
  await popup.keyboard.type('il');
  await expect(popup.getByRole('combobox')).toHaveValue('mail');
});

/**
 * Plants a text styled `style` at the foot of the popup's view, out of sight until the view scrolls, where axe
 * cannot judge it; returns the pass's outcome and the view's scroll after it, then removes the text.
 */
async function plantedOutOfView(popup: Page, style: Record<string, string>) {
  await popup.evaluate((style) => {
    const planted = document.createElement('div');
    planted.id = 'planted';
    const spacer = document.createElement('div');
    spacer.style.height = '1500px';
    const text = document.createElement('p');
    text.id = 'planted-text';
    text.textContent = 'Out of view';
    Object.assign(text.style, style);
    planted.append(spacer, text);
    document.querySelector('.view-content')!.append(planted);
  }, style);
  // The view, scrolling now, becomes a Tab stop once the popup sees its content grow.
  await expect(popup.locator('.view')).toHaveAttribute('tabindex', '0');
  try {
    const outcome = await checkAccessibility(popup).then(
      () => 'passed',
      (error: Error) => error.message,
    );
    return { outcome, scrollTop: await popup.locator('.view').evaluate((view) => view.scrollTop) };
  } finally {
    await popup.evaluate(() => document.getElementById('planted')?.remove());
    await expect(popup.locator('.view')).toHaveAttribute('tabindex', '-1');
  }
}

test('text scrolled out of view is judged scrolled into view: below 4.5:1 or still undecided there, it fails the pass, and the view keeps its scroll', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await expect(popup.getByRole('option')).toHaveCount(1);

  expect(await plantedOutOfView(popup, {})).toEqual({ outcome: 'passed', scrollTop: 0 });
  expect(await plantedOutOfView(popup, { color: 'rgb(160, 160, 160)' })).toEqual({
    outcome: expect.stringMatching(/^accessibility problems:\ncolor-contrast: #planted-text: [^\n]*insufficient color contrast of 2\.\d+[^\n]*$/),
    scrollTop: 0,
  });
  expect(await plantedOutOfView(popup, { color: 'rgb(130, 130, 130)', fontSize: '32px' })).toEqual({
    outcome: expect.stringMatching(/^accessibility problems:\ncolor-contrast: #planted-text: 3\.\d+:1 is below 4\.5:1$/),
    scrollTop: 0,
  });
  // A background axe cannot read in view either: still undecided, which is not contrast shown to hold.
  expect(await plantedOutOfView(popup, { backgroundImage: 'linear-gradient(white, black)' })).toEqual({
    outcome: expect.stringMatching(/^accessibility problems:\ncolor-contrast undecided: #planted-text: [^\n]*gradient[^\n]*$/),
    scrollTop: 0,
  });
});

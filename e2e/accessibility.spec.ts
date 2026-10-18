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

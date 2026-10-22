// The fit check itself (G7): each misfit it exists for, planted in the real popup, fails it for that reason;
// and the pictures that tell whether a field draws its value whole, and a text area the lines at its edges.
import type { Page } from '@playwright/test';
import { checkFit, expect, fieldDrawnWhole, popupOnNewPage, test, textAreaEdgeDrawnWhole, textViewInPopup } from './extension.ts';

/** What `checkFit` says of `popup` with `plant` applied: `fits`, or its failure. */
async function fitWith(popup: Page, plant: () => void): Promise<string> {
  await popup.evaluate(plant);
  return checkFit(popup).then(
    () => 'fits',
    (error: Error) => error.message,
  );
}

test('the check passes the popup as drawn and fails on text cut across or along', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  await checkFit(popup);

  expect(
    await fitWith(popup, () => {
      const wide = document.createElement('p');
      wide.id = 'wide';
      wide.style.whiteSpace = 'nowrap';
      wide.textContent = 'w'.repeat(300);
      document.querySelector('.view-content')!.append(wide);
    }),
  ).toContain('cut across: p. ');
  await popup.evaluate(() => document.getElementById('wide')!.remove());
  await checkFit(popup);

  expect(
    await fitWith(popup, () => {
      const short = document.createElement('div');
      short.style.cssText = 'height: 10px; overflow: hidden';
      short.className = 'short';
      short.innerHTML = '<p>one</p><p>two</p>';
      document.querySelector('.view-content')!.append(short);
    }),
  ).toContain('cut along: div.short ');
});

test('a box moved where the view cannot show or scroll to it, and a field too short for its text, fail the check', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  expect(await fitWith(popup, () => (document.querySelector<HTMLElement>('.row-line')!.style.transform = 'translateY(-60px)'))).toContain(
    'cut off by div.view ',
  );
  await popup.evaluate(() => document.querySelector<HTMLElement>('.row-line')!.removeAttribute('style'));
  await checkFit(popup);

  await popup.keyboard.type('ปั้นฎฏ');
  await checkFit(popup);
  expect(await fitWith(popup, () => (document.querySelector<HTMLElement>('.search-box')!.style.cssText = 'height: 8px; line-height: 8px; padding-block: 0'))).toContain(
    'text cut along: input.search-box ',
  );
  expect(await fitWith(popup, () => (document.querySelector<HTMLElement>('.search-box')!.style.cssText = 'height: 8px; padding-block: 0'))).toContain(
    'field shorter than its line: input.search-box ',
  );
});

test('a field whose line is at its cap may cut marks stacked past it; one pixel below the cap, or at its base under marks past its room, it fails the check and its picture', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  const box = popup.getByRole('combobox');
  // Acute accents stacked past any script's writing, past the 64 px cap of the search box's 16 px text.
  await box.fill(`a${'\u0301'.repeat(40)}`);
  await expect(box).toHaveCSS('line-height', '64px');
  await checkFit(popup);
  expect(await fitWith(popup, () => (document.querySelector<HTMLElement>('.search-box')!.style.lineHeight = '63px'))).toContain('text cut along: input.search-box ');

  // A Thai consonant over three vowels, past the room of the search box's 30 px base line, drawn far along the field.
  await box.fill(`${'a'.repeat(23)}ปุุุ`);
  await expect(box).not.toHaveCSS('line-height', '30px');
  expect(await fieldDrawnWhole(popup, box)).toBe(true);
  await checkFit(popup);
  await popup.evaluate(() => (document.querySelector<HTMLElement>('.search-box')!.style.lineHeight = '30px'));
  expect(await fieldDrawnWhole(popup, box)).toBe(false);
  expect(await fitWith(popup, () => undefined)).toContain('text cut along: input.search-box ');
});

test("a text area's edge that cuts the marks of its first or last line fails its picture", async ({ extension, site }) => {
  // A Thai consonant under a vowel and three tone marks on the first line, and over three vowels on the last.
  const middle = Array.from({ length: 38 }, (_, i) => `m${i + 1}  https://m${i + 1}.example/`);
  await extension.seedStorage({ mappings: ['ปั้้้  https://above.example/', ...middle, 'ปุุุ  https://below.example/'].join('\n') });
  const { popup } = await popupOnNewPage(extension, site);
  const { area } = await textViewInPopup(popup);
  // Four pixels of padding at each edge, too little room for either line's marks.
  for (const end of ['top', 'bottom'] as const) {
    await area.evaluate((element: HTMLElement) => (element.style.paddingBlock = '4px'));
    expect(await textAreaEdgeDrawnWhole(popup, area, end)).toBe(false);
    await area.evaluate((element: HTMLElement) => element.style.removeProperty('padding-block'));
  }
});

test("a row's name or URL cut without an ellipsis, or not from its start, fails the check", async ({ extension, site }) => {
  await extension.seedStorage({ mappings: `${'n'.repeat(300)}  https://example.com/${'p'.repeat(300)}\n` });
  const { popup } = await popupOnNewPage(extension, site);
  await checkFit(popup);
  expect(await fitWith(popup, () => (document.querySelector<HTMLElement>('.row-name')!.style.textOverflow = 'clip'))).toContain('cut across: span.row-name ');
  await popup.evaluate(() => document.querySelector<HTMLElement>('.row-name')!.removeAttribute('style'));
  expect(await fitWith(popup, () => (document.querySelector<HTMLElement>('.row-url')!.style.textIndent = '-40px'))).toContain('cut across: span.row-url ');
});

test('a page taller than the viewport, a footer out of view, and a popup.html in a tab each fail the check', async ({ extension, site }) => {
  await extension.seedStorage({ mappings: 'mail  https://mail.example.com/\n' });
  const { popup } = await popupOnNewPage(extension, site);
  expect(
    await fitWith(popup, () => {
      const tall = document.createElement('div');
      tall.id = 'tall';
      tall.style.height = '2000px';
      document.body.append(tall);
    }),
  ).toMatch(/the page is \d+ by \d+ in a \d+ by \d+ viewport/);
  await popup.evaluate(() => document.getElementById('tall')!.remove());
  await checkFit(popup);
  expect(await fitWith(popup, () => (document.querySelector<HTMLElement>('footer')!.style.cssText = 'position: relative; top: 1000px'))).toContain(
    'not whole in view: footer.footer ',
  );

  const inTab = await extension.context.newPage();
  await inTab.goto(extension.url('popup.html'));
  expect(await fitWith(inTab, () => undefined)).toContain('this is a popup.html open in a tab, not the action popup');
});

// Chrome sizes the popup to the content in whole device pixels, rounding down: at a fractional scale, a content
// height that is not whole in them would leave the viewport a fraction of a device pixel short.
test.describe('at a display scale of 1.25', () => {
  test.use({ displayScale: 1.25 });

  test('a list the popup holds whole does not scroll for the fraction of a device pixel the viewport falls short by', async ({ extension, site }) => {
    // Two rows and the This page row: a content height that is not whole in device pixels.
    const pageUrl = site.pageUrl('Where the popup opens');
    await extension.seedStorage({ mappings: `mail  https://mail.example.com/\nmaps  https://maps.example.com/\nhere  ${pageUrl}\n` });
    const page = await extension.context.newPage();
    await page.goto(pageUrl);
    const popup = await extension.clickToolbarButton(page);
    await popup.keyboard.type('ma');
    await expect(popup.getByRole('option')).toHaveCount(2);
    await expect(popup.getByText('This page is "here"')).toBeVisible();
    const geometry = () =>
      popup.evaluate(() => {
        const main = document.querySelector('main')!;
        const view = document.querySelector<HTMLElement>('.view')!;
        const content = main.getBoundingClientRect().height - parseFloat(getComputedStyle(main).paddingBottom);
        return {
          // The content's height in device pixels, before the root pads it: its fraction is what Chrome drops.
          fraction: (content * devicePixelRatio) % 1,
          shortfall: document.documentElement.scrollHeight - innerHeight,
          viewScroll: view.scrollHeight - view.clientHeight,
          viewScrollbar: view.offsetWidth - view.clientWidth,
          viewTabIndex: view.tabIndex,
          pageScrollbar: innerWidth - document.documentElement.clientWidth,
        };
      });
    // The state is one Chrome rounds: the content is a quarter to three quarters of a device pixel over a whole one.
    await expect
      .poll(() => geometry().then(({ fraction }) => fraction > 0.2 && fraction < 0.8), { message: 'this state is a whole number of device pixels tall' })
      .toBe(true);
    await expect.poll(geometry).toMatchObject({ shortfall: 0, viewScroll: 0, viewScrollbar: 0, viewTabIndex: -1, pageScrollbar: 0 });
    await checkFit(popup);
  });
});

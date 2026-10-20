// The product's acceptance for editing the list, in both settings hosts: in a 40-line document with comments,
// blank lines, tab-separated lines, and one line that is not a mapping, the user renames one mapping in the List
// view, then moves another mapping up past a heading. Apart from the line endings G12 moves, the document is the
// original with the renamed line rewritten and the moved line, byte for byte, in its new place; the non-mapping
// line is listed as unreadable and is unchanged; the moved mapping sits directly before the mapping that
// preceded it and no other mapping changed its place among the comment and blank lines (G12, G16, F12).
import { readDocument } from '../src/document/grammar.ts';
import { checkFit, expect, lineConfirmation, listViewIn, rowEditor, SETTINGS_HOSTS, test } from './extension.ts';

const NEWS = 'news                 https://news.ycombinator.com/            \\ a comment after a mapping is its note';
const UNREADABLE = 'read later';
const TEAM = 'team calendar        https://calendar.google.com/calendar/u/0/r/week';
/** Tab-separated, with trailing spaces, and last: moved up, it gains the document's ending and the line that becomes last loses its own. */
const BANK = 'bank\thttps://bank.example/   ';

const LINES = [
  '\\ URLJumper mappings, kept by hand',
  '\\ ----------------------------------',
  '',
  '\\ Daily',
  'mail                 https://mail.google.com/',
  'cal                  https://calendar.google.com/',
  NEWS,
  'weather\thttps://weather.example/',
  '',
  '\\ Work',
  '\\   (the second line of the heading)',
  'jira                 https://jira.example/browse/',
  'ci\thttps://ci.example/builds              \\ the build board',
  'docs                 https://docs.example/',
  'wiki                 https://en.wikipedia.org/w/index.php?search=%s',
  '',
  UNREADABLE,
  '   ',
  '\\ Search',
  'g                    https://www.google.com/search?q=%s',
  'yt                   https://www.youtube.com/results?search_query=%s',
  'maps\thttps://maps.google.com/?q=%s',
  '',
  '\\ Code',
  'gh                   https://github.com/',
  'gist                 https://gist.github.com/',
  'npm\t\thttps://www.npmjs.com/search?q=%s',
  'mdn                  https://developer.mozilla.org/en-US/search?q=%s',
  '',
  '\\ Reading',
  'lobsters             https://lobste.rs/',
  'arxiv\thttps://arxiv.org/list/cs/new',
  '',
  '\\ Later',
  '\\ things to sort',
  '',
  TEAM,
  '',
  '\\ End',
  BANK,
];
const DOC = LINES.join('\n');

/**
 * By the document module's reading of `document`: for each mapping line but `moved`'s, in order, how many
 * comment, blank, and unreadable lines stand before it; and those lines' exact texts, in order.
 */
function placesAmongTheOthers(document: string, moved: string) {
  const places: number[] = [];
  const others: string[] = [];
  for (const line of readDocument(document).lines) {
    if (line.kind !== 'mapping') others.push(line.text);
    else if (line.mapping.name !== moved) places.push(others.length);
  }
  return { places, others };
}

for (const host of SETTINGS_HOSTS) {
  test(`in the ${host}, a 40-line document with one mapping renamed and another moved up past a heading is the original with those two lines changed`, async ({ extension, site }) => {
    expect(LINES).toHaveLength(40);
    const { page, view, check } = await listViewIn(host, extension, site, { mappings: DOC });
    // The non-mapping line is an unreadable row, its raw text as written.
    await expect(view.raw).toHaveText([UNREADABLE]);
    await expect(view.unreadableRows.locator('.list-number')).toHaveText(['17']);

    await view.pencil('news').click();
    const editor = rowEditor(page);
    await editor.name.fill('hacker news');
    await editor.save.click();
    await expect(lineConfirmation(page).text).toHaveText('Changed "hacker news" on line 7');
    // F12: the URL's and the note's columns kept, the new name fitting before them.
    const renamed = `hacker news${NEWS.slice('hacker news'.length)}`;
    expect((await extension.readStorage()).mappings).toBe(DOC.replace(NEWS, renamed));

    await view.pencil('bank').click();
    // The accessibility pass walks every control by Tab in both schemes, which on forty lines outlasts the ten
    // seconds a confirmation stands (G15): it runs on the list with the editor open here, and the state after
    // the move, a confirmation beside the editor, is passed in `list-view-move.spec.ts`.
    await check();
    await editor.moveUp.click();
    await expect(lineConfirmation(page).text).toHaveText('Moved "bank" to line 37');
    // Far down a long list, the Undo comes into view below the editor, which keeps the focus.
    await expect(lineConfirmation(page).undo).toBeInViewport();
    await expect(editor.moveUp).toBeFocused();
    const stored = (await extension.readStorage()).mappings as string;
    // The moved line byte for byte directly before the mapping that preceded it, the heading between them now
    // below both; it gains the document's ending, and the heading's line, now last, loses its own (G12).
    expect(stored).toBe([...LINES.slice(0, 6), renamed, ...LINES.slice(7, 36), BANK, TEAM, '', '\\ End'].join('\n'));
    const lines = readDocument(stored).lines;
    expect(lines[36]!.text).toBe(BANK);
    expect(lines[37]!.kind === 'mapping' && lines[37]!.mapping.name).toBe('team calendar');
    expect(placesAmongTheOthers(stored, 'bank')).toEqual(placesAmongTheOthers(DOC, 'bank'));
    await expect(view.raw).toHaveText([UNREADABLE]);
    expect(lines[16]).toMatchObject({ kind: 'unreadable', text: UNREADABLE });
    if (host === 'popup') await checkFit(page);
  });
}

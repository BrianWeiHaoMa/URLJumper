# URLJumper — Product Specification

## Authority

This document outranks every other document, decision, and line of code in this project. `TECHNICAL_SPECIFICATION.md` is written from it and ranks second. `Fixed decisions` and `Non-goals` hold everywhere. `Guarantees` hold for every use inside `Operating envelope` and bind exactly as strongly there; outside the envelope nothing is promised. Unassigned implementation choices are deliberately open for downstream work at its own level. An explicitly pending decision remains with its named owner and is not a delegated choice. Work that finds a line here unworkable stops the dependent work and reports the conflict and a proposed amendment; independent work continues. It does not work around the line, narrow it, or change the envelope to make a failure disappear. Labels (`E1`, `F1`, `G1`, `N1`, `L1`) are permanent and are how every downstream document cites this one.

## Product

URLJumper is a Chrome extension for one person who returns to the same web pages often and would rather type a short name than find a bookmark or retype a URL. The user keeps **mappings**, each pairing a **name** of their own choosing with a **URL**, in one plain-text **document**. From any Chrome window that shows its toolbar they open the **popup** with a keyboard shortcut, type part of a name, and press Enter to arrive. The promise is: type a name, press Enter, arrive.

Version 2.0 replaces version 1.x and serves three people. The long-time user has a hand-maintained document, often with comment lines as section headings and columns aligned with spaces; their test is that everything they had still works the same way and nothing moved their lines. The newcomer installs from the Chrome Web Store, sees nothing, and needs a first mapping in without reading a grammar; their test is that they were on a page, gave it a name, and the next time they typed that name they were there. The daily user has dozens to hundreds of mappings and wants the one they use daily to come up first, wants to pass a search term through a name, and wants to reach the popup without taking hands off the keyboard.

What they get, beyond everything 1.x gave (the popup, the document edited as text with Save, Import and Export, Copy tab URL, light and dark theme, two shortcuts): **Name this page**, which turns the current page or a right-clicked link into a mapping with one action and one name; a **List view** that edits the same document line by line without a grammar; **argument aliases**, where a URL containing `%s` takes the text typed after the name; **Smart order**, an optional ranking that puts recently used mappings first; **address matches**, a lower group for the day the user remembers the site but not the name; and an **address-bar keyword**, `j`, that offers the same mappings from Chrome's address bar.

What must not be lost is the document. The extension writes it only when the user saves text, asks for a single-line change, or loads the example mappings into an empty document, and a change is applied as a whole or not at all. Upgrading from 1.x leaves the stored document byte for byte, keeps the search order the user is used to, keeps their theme, and adds no permission that shows a warning.

Accepted limits, each of which also lowers the cost of building it:

- The document is the only copy. Chrome's profile storage holds it; profile loss, disk failure, and power loss are not survived. Export is the backup, and the user makes it.
- There is no history of the document. A single-line change can be undone only while its confirmation shows; after that, recovery is retyping the line or importing an export.
- Learned usage for Smart order, unsaved text drafts, and preferences are conveniences. Losing them costs ranking, a retype, or a setting, never a mapping.
- One person, one Chrome profile, one machine. Nothing syncs; Export and Import move mappings between profiles.
- Everything is local: no account, no server, no network request by the extension, no telemetry.
- Chrome 127 or later; no other browser.
- English only.

## In use

**Jump.** The user presses Alt+N (or Alt+M, or clicks the toolbar button). The popup opens with the search box focused and a chip in the search bar reading *New tab* (Alt+N, toolbar button) or *This tab* (Alt+M); clicking the chip flips it for this popup. They type `st`. The list updates on every keystroke and shows the matching mappings, each with its name and URL, seven rows at a time, the first row selected; a cue under the rows says how many more there are. Up and Down move the selection, wrapping at the ends, and scroll the seven-row window through every match. Enter opens the selected mapping in the chip's mode; Shift+Enter in the other mode; a click opens a row and Shift+click opens it in the other mode; Escape closes. A footer says what Enter does in the current state. With a blank box the list shows mappings (recently used first under Smart order, the top of the document under Document order) with nothing selected, so the user can browse with Down and an accidental Enter opens nothing.

**Jump with an argument.** With the line `yt                   https://www.youtube.com/results?search_query=%s` in the document, the user types `yt lo-fi beats`. A row shows the filled URL, `https://www.youtube.com/results?search_query=lo-fi%20beats`; Enter opens it. Typing `yt` alone shows the mapping's URL with `%s` marked and a hint that Space and text fill it; Enter then opens the URL with `%s` empty.

**Jump from the address bar.** The user presses Ctrl+L (⌘L on macOS), types `j`, a space, and `st`. Chrome's suggestions show the same mappings in the same order as the popup would, name and URL; the top match is the default. Enter opens it; Chrome's own modifier for opening a suggestion in a new tab applies. When nonblank text matches nothing, the one suggestion says that Enter searches with the user's default search engine, and Enter searches the text after `j` in the tab Chrome's modifier selects. With nothing typed after the keyword, Enter does nothing.

**Name this page.** On a page, the user presses Alt+Shift+N, or the key they gave *Name this page* in Chrome's shortcuts page where Chrome left it unassigned (or, in the popup, activates the *Name this page* button). The popup opens on the **Name form**, showing the tab's title and host, the current URL (prefilled, editable), an empty name field with focus, an empty note field, each field with a copy button at its right, and, when the document has comment headings, a *Section* choice whose default is *End of document*. A preview shows the exact line that will be written and where. They type `stocks` and press Enter. The popup shows *Saved "stocks" as line 37* with *Undo* and returns to search. If the name is already used, the form says so with its line number, blocks Save, and offers *Edit "stocks" instead*. If the page's URL already has a mapping, the form says *This page is "‹name›"* and still saves the new name as a second name for the same URL. When Chrome yields no address for the tab, the form shows neither title nor address, says so, and the URL must be typed or pasted.

**Name from a search.** The user types text that matches no name and is not an argument for one. The last row is *Name "‹text›" for this page*; when it is the only row it is selected, so Enter opens the form with the name prefilled and a second Enter saves. When address matches accompany it, the Name row is still last and Down reaches it.

**Name a link.** The user right-clicks a link and chooses *Name this link in URLJumper*. The popup opens on the same form with the link's address as the URL and a line saying which page it was on. *Name this page in URLJumper* on a page does the same for the page.

**Edit from a suggestion.** The user activates the pencil on a row (Tab reaches it from the search box). The row expands into name, URL, and note fields, each with a copy button at its right, *Copy tab URL* above them, with *Save*, *Delete*, *Copy link*, and *Open in text*, taking the popup's list while it is open; the other rows return when it closes. Save rewrites that line only. Delete asks nothing and offers Undo. Copy link puts the destination on the clipboard without opening it.

**Edit the list.** In settings (the gear in the popup, or the full settings page), the *List* view shows the document's mappings in document order with line numbers, comment-only lines as section headings and a trailing comment as the row's note. Each row can be edited in place, deleted, or moved up or down; its editor's fields each have a copy button at their right, and its editor in the popup offers *Copy tab URL*; *Add mapping*, at the top right, opens the Name form without a page. Every action saves at once, changes only the line it concerns, and offers Undo. A line the extension cannot read appears as an unreadable row showing its raw text with *Fix in text*.

**Edit the text.** The *Text* view shows the whole document in a text area with a short grammar hint beside it; the text area's content is the **draft**. The user edits freely and presses *Save*. Save validates the whole document: with no error it is stored; otherwise nothing is stored and every error is listed with its line number, and activating one moves the caret to that line. *Import…* loads a chosen `.txt` file as the draft, to be saved like any other edit; *Export…* downloads the stored document; both sit at the top right, in the popup's settings and on the full settings page. In the popup's Text view, *Copy tab URL* copies the address of the tab the popup was opened on. If the stored document changed while the draft was open (a Name this page from another window, say), Save says so and offers to bring the change into the draft before anything is overwritten. An unsaved draft survives the popup closing and is offered back, to resume or discard, the next time a Text view opens.

**Preferences.** Search order (*Document order* or *Smart order*) with *Reset learned order*; theme (*System*, *Light*, *Dark*); the view the popup's settings open on (*Preferences*, *List*, *Text*; Preferences until another is chosen); a read-only note of the address-bar keyword; and the shortcuts, with a link to Chrome's page for changing them.

**First run.** With an empty document the popup shows two actions: *Name this page*, selected so Enter starts it, and *Load example mappings*, which stores the example document of F11 so the grammar is learned by example. It also shows the shortcuts and where to change them.

**Upgrade from 1.x.** Nothing is migrated. The document, the theme, and the shortcuts are as they were, and Document order remains the search order. The first popup after the upgrade shows a one-line notice of what is new; any keystroke but Tab and Shift+Tab, or its close control, dismisses it for good, and activating it opens a short page bundled with the extension.

**The most common failure.** The user presses Save in the Text view with a line that has a name but no URL. Nothing is stored. The view lists *Line 12: expected a name and a URL*, the caret moves to line 12 when the error is activated, the status reads *Not saved*, and the draft stays exactly as typed.

## Non-goals

- **N1.** No bookmark-manager features: no folders, tags, favicons, or page previews.
- **N2.** No accounts, servers, shared or team directories, telemetry, or network requests of the extension's own, including fonts or scripts loaded from the network.
- **N3.** No sync between profiles or machines, and no import from Chrome bookmarks or history.
- **N4.** Neither the popup nor the address-bar keyword ever lists browsing history, open tabs, bookmarks, page contents, or web suggestions; the only rows offered as results are mappings, the popup's Name row, and the one line the address bar shows when it lists no mapping.
- **N5.** No matching of typed letters in order with gaps (`gh` does not find `github`).
- **N6.** No automatic naming: a page title never becomes a name without the user typing it.
- **N7.** No scripted or multi-step actions, and no mapping with several URLs.
- **N8.** No general-launcher features: no calculator, app launching, or clipboard history.
- **N9.** The document is not replaced by a database that only exports to text, and the extension writes no hidden identifier or marker into it.
- **N10.** No user-changeable address-bar keyword, no second keyword, and no support for browsers other than Chrome.
- **N11.** No localization: every string is English.

## Operating envelope

Behavior outside these assumptions is not promised.

- **E1.** Google Chrome 127 or later on Windows, macOS, Linux, or ChromeOS, installed from the Chrome Web Store as an update of the existing listing or loaded unpacked for development. One person uses one Chrome profile; several windows, popups, and settings tabs of that profile may be open at once and may save in any order.
- **E2.** No program other than the extension and Chrome itself writes the extension's storage; the user changes the document only through the extension's own views and Import. Chrome's profile storage is intact: power loss, disk failure, profile deletion, and corruption of Chrome's storage are outside the supported use.
- **E3.** The document holds at most 10,000 lines and at most 1 MB of text as Chrome stores it, the UTF-8 bytes of its JSON serialization. Its content is any text: lines 1.x accepted, lines the user typed, and lines the extension cannot read. A Text view draft, the text typed after the address-bar keyword, and the address of a link being named together with the address and title of the page it is on are each at most 1 MB measured the same way. Every text named here and in E8 is made of Unicode characters: a lone surrogate in one (half of a UTF-16 surrogate pair, which no keyboard types and only a paste or drop of broken text can bring) is outside the supported use.
- **E4.** The popup may be closed at any moment, including during a save, because Chrome closes it whenever it loses focus; Chrome itself may be closed at any moment.
- **E5.** The current tab is the tab in front of its window as the popup opens, or as Chrome delivers an address-bar Enter; its address and title are available only when Chrome grants them for the user's own invocation: the toolbar button, a keyboard command, or a menu item. A popup reached otherwise has neither.
- **E6.** The user may have reassigned any shortcut in Chrome's shortcuts page, and Chrome may leave a suggested key unassigned when another extension, the system, or Chrome itself already uses it; current Chrome on Windows and Linux uses Alt+Shift+N itself, for a new split tab.
- **E7.** A mapping's URL may use any scheme; whether Chrome opens a given scheme, or a URL longer than Chrome navigates to (2,097,152 characters once Chrome has percent-encoded it), is Chrome's decision.
- **E8.** Names, URLs, notes, and argument text are whatever the user types, in any script.
- **E9.** After the extension is installed or updated, Chrome stays open for the fraction of a second in which the extension records that install; a Chrome closed within it may start a new install in Document order and show an upgrader no notice of what is new.

## Fixed decisions

- **F1.** The product is named URLJumper, in the manifest, the Web Store listing, every menu item, and every string.
- **F2.** It is a Chrome Manifest V3 extension, version 2.1.0, published as an update of the existing Web Store item so that 1.x users receive it.
- **F3.** The document is stored exactly as 1.x stores it: the whole text as one string under the key `mappings` in the extension's local storage (`chrome.storage.local`). The theme preference stays under the key `themePref` with the values `light` and `dark`; its absence means System. Every other stored thing (learned usage, the search-order preference, text drafts, the upgrade notice's state) lives under other keys of the same local storage, never in the document and never in sync storage.
- **F4.** The grammar of the document is that of 1.x, with one addition. Lines are separated by LF or CRLF. A backslash (`\`) starts a comment that runs to the end of the line wherever it appears. A line that is empty or only whitespace after its comment is removed is blank. Any other line is a mapping line: after leading and trailing whitespace is removed, its URL is the last run of non-whitespace characters, the whitespace before the URL separates, and everything before that whitespace is the name, which may contain whitespace within it. The URL begins with a scheme: an ASCII letter, then any ASCII letters, ASCII digits, `+`, `.`, or `-`, then `:`; letters are matched regardless of case. Names are compared regardless of case; a name that repeats the name of an earlier mapping line is an error. A line that is neither blank nor a mapping line as just defined is an error. The addition: `%s` inside a URL marks where an argument goes; a mapping whose URL contains `%s` is an **argument alias**.
- **F5.** The keyboard commands are `open-new-tab` (suggested Alt+N; the popup opens in New tab mode), `open-same-tab` (suggested Alt+M; This tab mode), both with the identifiers and suggested keys they had in 1.x so that Chrome keeps shortcuts users assigned to them, and `name-this-page` (suggested Alt+Shift+N; the popup opens on the Name form). All three are changeable only in Chrome's shortcuts page.
- **F6.** The address-bar keyword is `j`, declared in the manifest.
- **F7.** The right-click menu items are *Name this page in URLJumper*, shown on pages, and *Name this link in URLJumper*, shown on links.
- **F8.** The permissions are the three 1.x declared, storage, activeTab, and clipboardWrite, plus contextMenus and search, the address-bar keyword, and the commands. The search permission lets unmatched address-bar Enter use Chrome's configured default search engine. Nothing added carries an install or update warning, so a 1.x user is never asked to accept a permission at upgrade; `tabs`, `history`, `favicon`, and host permissions are not declared.
- **F9.** An argument is substituted for every `%s` in the URL after percent-encoding as a URI component: letters, digits, and `- _ . ! ~ * ' ( )` stay, every other character is encoded as its UTF-8 bytes, and a space becomes `%20`. With no argument, every `%s` is removed.
- **F10.** Export writes the stored document as a UTF-8 text file named `URLJumperMappings.txt`. Import reads any file the user chooses as UTF-8 text.
- **F11.** The example document is exactly this text, with LF line endings and a final line break:

  ```
  \ Daily: a backslash starts a comment, and a comment line like this one is a section heading
  mail                 https://mail.google.com/
  cal                  https://calendar.google.com/
  news                 https://news.ycombinator.com/            \ a comment after a mapping is its note
  
  \ Search: type the name, a space, then what to look for
  g                    https://www.google.com/search?q=%s
  yt                   https://www.youtube.com/results?search_query=%s
  wiki                 https://en.wikipedia.org/w/index.php?search=%s
  
  \ Names can have spaces; blank lines are fine
  team calendar        https://calendar.google.com/calendar/u/0/r/week
  ```

- **F12.** A line the extension writes is the name, spaces, the URL, and, when there is a note, spaces, `\ `, and the note. The URL starts at the column (counted from 1) where the URL starts on the nearest mapping line above the insertion point, else the nearest below, else column 22; when the name is too long for that, one space separates them. A rewritten line keeps its URL's column and its note's column when the new values fit, else one space. A new line takes the document's line ending (CRLF when the document's first line break is CRLF, else LF).
- **F13.** The popup's search list shows seven rows at a time.
- **F14.** A **heading** is a maximal run of consecutive lines that each hold a comment and nothing else. A **section** is a heading together with the lines after it up to the next heading or the end of the document. A **note** is the comment on a mapping line, without the backslash and surrounding whitespace.
- **F15.** The search-order preference has two values, Document order and Smart order; the theme preference has three, System, Light, and Dark.

## Guarantees

Search and the list:

- **G1.** For typed text, let T be the text with leading and trailing whitespace removed, compared regardless of case. When T is not empty the list holds, in this order and nothing else: (a) the mapping whose name equals T; (b) mappings whose names start with T; (c) the argument row: for the longest argument alias A such that the typed text, after leading whitespace, starts with A's name (regardless of case) followed by a space, and the remainder after that space is not empty once trimmed, one row showing A's URL with that trimmed remainder substituted as the argument, provided the URL so filled (F9) is at most 2,097,152 characters long, the longest Chrome navigates to (E7); (d) mappings whose names contain T elsewhere; (e) mappings whose URLs contain T, labelled as address matches; (f) the row *Name "T" for this page* when (a) to (d) are all empty. A mapping appears once, in its strongest group. Unreadable lines never appear.
- **G2.** Within each group, Document order lists mappings by line number. Smart order lists mappings that have been used, by use score, then the rest by line number.
- **G3.** When T is not empty the first row is selected as soon as the list appears, Up and Down move the selection and wrap at the ends, and the selected row is always visible. When T is empty the list holds every mapping in the order of G2 and nothing is selected until Down is pressed.
- **G4.** Enter, and a click, act on the selected or clicked row and on nothing else: a mapping opens its URL; the argument row opens the filled URL; the Name row opens the Name form with T as the name. With nothing selected Enter does nothing. Nothing opens without Enter or a click.
- **G5.** Enter and a click open in the mode the chip shows; Shift+Enter and Shift+click open in the other mode. The chip starts as New tab when the popup was opened by the toolbar button, `open-new-tab`, `name-this-page`, or a menu item, and as This tab when opened by `open-same-tab`.
- **G6.** Opening a mapping navigates to its URL exactly as written, in a new tab or the current tab, and the popup closes. An argument alias opened without an argument navigates with every `%s` removed; with an argument, with F9's substitution. A row for an argument alias without an argument shows the URL with `%s` marked and a hint that Space and text fill it.
- **G7.** The popup fits within Chrome's popup size limit in every state, with no content of its own cut off, except that a name, URL, or note longer than the row that lists it is shown from its start and cut with an ellipsis, and that marks stacked on a character higher or deeper than any script's own writing stacks them, such as a run of repeated accents, are cut where they reach the edge of a text field's line, of a view, or of the popup.

Naming:

- **G8.** The Name form saves when the name, trimmed, is not empty, contains no backslash or line break, and is not already the name of another line regardless of case; and the URL begins with a scheme per F4 and contains no whitespace, backslash, or line break; and the note, which may be empty, contains no line break. A taken name blocks Save, names the line that has it, and offers to edit that mapping instead. A rejected value is kept in the field.
- **G9.** The saved line is written per F12 after the last line of the document that holds more than whitespace (at its start when there is none), or, when a section is chosen, after the last such line of that section. When Save runs, the chosen heading is found again as the heading with its exact text that has as many headings with that text before it as when it was chosen; if there is none, the line goes after the last such line of the document and the confirmation says so. The confirmation names the name and the line number and offers Undo. Every other line of the document is unchanged byte for byte (G12).
- **G10.** When the current tab's address equals a mapping's URL exactly, the popup says *This page is "‹name›"* with an edit action, and naming the page again saves a second name for the same URL.
- **G11.** The Name form opened for a link names the link's address and shows the page the link was on; the Name form reached from *Add mapping* has no page and an empty URL field.

Editing single lines:

- **G12.** Every change made from the List view, the popup's row editor, the Name form, or Undo rewrites, inserts, or removes exactly the line it concerns and leaves every other line byte for byte, comments, blank lines, spacing, and line endings included, except that a line that stops being last gains the document's line ending (F12) and a line that becomes last loses its own; when Undo removes an inserted line, the line that insert gave an ending, if it becomes last with its exact text unchanged since, loses only that ending. Moving a row cuts its line and pastes it directly before the previous mapping line (up) or directly after the next mapping line (down); comment and blank lines keep their relative order, so every other mapping keeps its place among them. The first mapping cannot move up, the last cannot move down, and no mapping moves past another line with its name.
- **G13.** Before storing, every such change other than Undo (which has its own check in G15) re-reads the stored document and applies itself to the line it was loaded from, found again by its exact text even when lines above it were added or removed since. If that line has been changed or removed, nothing is stored, the view reloads the document, says what changed, and offers *Edit again* with the user's values still filled in. An insert re-checks that the name is still free. The stored document therefore never holds a duplicate name or an unreadable line of the extension's own making.
- **G14.** The row editors apply G8's rules to the name, the URL, and the note, and keep a rejected value in its field. A cleared note removes the comment and the whitespace before it.
- **G15.** Each change from G12 offers Undo until the user's next action in that view, the popup or page closing, or ten seconds, whichever comes first. Undo is a single-line change of its own that reverses the change: it removes an inserted line, re-inserts a removed line at its former line number (at the end when the document is now shorter), restores a rewritten line, or moves a moved line back. It re-reads the stored document first, as G13 does, and acts only when the line it must remove, restore, or move back still stands as the change left it and, for a re-insertion or a restored name, the name is still free of other lines; otherwise nothing is stored and the view says so.
- **G16.** A line the extension cannot read is shown in the List view as an unreadable row with its raw text and *Fix in text*, is skipped by search, and is rewritten only by a Text view Save.

The text document:

- **G17.** Save in the Text view validates the whole draft by F4. With no error the draft is stored as the text area holds it. With any error nothing is stored, each error is listed with its line number, and activating an error moves the caret to that line. The draft stays exactly as typed either way.
- **G18.** If the stored document changed after the draft was loaded, Save stores nothing until the user decides: changes in the stored document to lines the draft did not change are brought into the draft with one action, and a line changed differently in both is offered in the stored version and the draft's. No save from any view overwrites another view's change silently.
- **G19.** One draft, the most recent unsaved Text view edit, is kept across the popup closing, a return to search, and a switch to the List view, and is offered back the next time a Text view opens, to resume or discard. It is stored as it is typed and discarded only when the stored document holds its text, as after its Save, or the user discards it; keystrokes still in flight when the popup or Chrome closes may be lost, and of two edits made in different views within one millisecond either may be the one kept. Switching to List with unsaved changes asks: save and switch, keep the draft and switch, or stay. Import with unsaved changes asks before replacing the draft.
- **G20.** Import makes the chosen file's text the draft and stores nothing until Save. Export writes the stored document unchanged (F10).

Storing:

- **G21.** A store of the document applies the whole new document or leaves the stored one unchanged, including when the popup or Chrome closes during it. When a store fails while its view is open, the view says so and keeps what the user typed. When the view closed before the store finished, the document shows the outcome the next time it is opened, and a Text view draft is still there under G19.
- **G22.** The document is written only by: Save in the Text view, a single-line change per G12, Undo, and *Load example mappings* under G30. Nothing else, and no upgrade, writes it.

Upgrade:

- **G23.** After installing 2.0 over 1.x: the stored document is byte for byte what 1.x stored; the theme is what the user had chosen, or System if they had not chosen; the search order is Document order until the user changes it; and for the same typed text the mappings 1.x listed appear in the same relative order, with three deliberate changes: a mapping whose name equals the typed text is listed first even when an earlier line's name starts with it; whitespace at the end of the typed text is ignored; and a URL containing `%s` opens with `%s` removed or replaced per F9, where 1.x opened it with `%s` literally. Rows 1.x never showed (the argument row, address matches, the Name row) appear only in their places under G1.
- **G24.** A new install starts in Smart order with the System theme.
- **G25.** The first popup after an upgrade from 1.x shows a one-line notice of what is new; any keystroke but Tab and Shift+Tab, which move the focus to and from the notice, or its close control dismisses it, it is never shown again, and activating it opens a page bundled with the extension. Nothing else about the upgrade asks the user anything.

Smart order:

- **G26.** A use is a jump from the popup (Enter or click), a jump from the address bar, or the creation of a mapping. Browsing is never a use. Each use of a mapping the document still holds records its name (regardless of case), URL, and time outside the document.
- **G27.** Under Smart order, mappings within a group are ordered by a use score that rises with each use and decays with the time since each use; a mapping used within the last 24 hours ranks above any mapping not used in the last 30 days, whatever their counts. Renaming a mapping or changing its URL starts its learning afresh. *Reset learned order* removes all learned usage. Changing the order preference takes effect on the next list.

Address bar:

- **G28.** While the address bar is in URLJumper's keyword mode for `j`, the suggestions are groups (a) to (e) of G1 for the text typed, in the order of G1 and G2, as many as Chrome shows, each showing the name and the URL (the filled URL for the argument row); the top match is the default suggestion. Enter opens the selected suggestion as G6 opens it, in the tab Chrome's own modifier for new-tab opening selects. When nonblank text matches nothing, the one suggestion says that Enter searches with the user's default search engine, and Enter searches the text after `j` through Chrome's configured default search engine, in the tab Chrome's modifier selects; no search is made before Enter. With nothing typed after the keyword, or only whitespace, Enter does nothing. A mapping jump from here is a use (G26); a search changes neither mappings nor learned usage.

Right-click menu:

- **G29.** In a window that shows its toolbar, *Name this page in URLJumper* opens the popup on the Name form for the page, and *Name this link in URLJumper* opens it per G11 for the link.

First run and surfaces:

- **G30.** While the document is absent or holds only whitespace, the popup shows the first-run state of *In use* in place of the list: *Name this page* is selected and Enter starts it, as the one exception to G3 and G4; *Load example mappings* stores F11's text and is offered only then.
- **G31.** The popup's settings and the full settings page offer the same List view, Text view, and Preferences; the popup's settings also offer *Open in tab*. *Import…* and *Export…* exist only in the Text view, in both. *Copy tab URL* exists only in the popup's Text view, in the Name form the popup's *Add mapping* opens, and in the popup's row editors, the one a suggestion opens and the one its List view opens, and copies the opener tab's address when Chrome grants it. *Copy link* exists only in the row editor a popup suggestion opens and copies the row's destination (the filled URL for the argument row) without opening it. In every Name form and row editor, the name, URL, and note fields each have a copy button at their right that copies the field's value as it stands, typed or not.

Everyone:

- **G32.** Every flow in *In use* can be completed with the keyboard alone, and every control is also reachable by pointer. Every control has a name a screen reader can speak, focus is always visible, and text meets a contrast ratio of 4.5:1 against its background in both themes.
- **G33.** The extension makes no network request of its own. Nothing the user types in the extension's own views, saves, or opens leaves the machine except by the navigation the user asked for.

## Left open

- **L1.** The technical writer chooses the language, framework, build, and test tooling, under F2, N2 (no network at run time, fonts bundled or from the system), and this constraint: the public repository builds the Web Store package with one documented command, and nothing from the 1.x code is required.
- **L2.** The technical writer and builder choose the visual layout, typefaces, colors, spacing, and exact wording of messages, under G7, G32, and this constraint: every validation error names its line number, every confirmation of a single-line change names the name and the line, and the footer always states what Enter does.
- **L3.** The technical writer chooses the use-score formula and its storage under G26 and G27.
- **L4.** The technical writer chooses which key, besides Tab to the pencil, edits the selected row in the popup, under this constraint: it works on Windows, macOS, and Linux, it is not a combination Chrome reserves, and no shortcut key in the popup deletes a line (Delete is a control, activated like any other).
- **L5.** The technical writer chooses the storage keys for everything F3 leaves unnamed, the text shown for a heading in the Section choice (its comment text is the constraint), and the contents of the bundled what's-new page, which names the exact-name change, `%s`, Name this page, the keyword `j`, and Smart order.
- **L6.** The technical writer chooses how a document of a size permitted by E3 is rendered in the List view, under G3 and G32.

## Done when

- A fresh profile runs 1.3.0 with a saved document holding aligned columns, a comment heading, a mapping with a trailing comment, a blank line, and a tab; the theme is set to dark and Alt+N is reassigned to Alt+J in Chrome. 2.0 is installed over it. The stored `mappings` value is byte-identical to the one saved before; the theme is dark; Alt+J opens the popup; the Preferences show Document order; typing a prefix shared by two names lists them in line order, and typing in full a name that an earlier line's name starts with lists it first.
- On an ordinary web page whose address holds no `%s`, the user presses the *Name this page* shortcut (Alt+Shift+N, or the key assigned to it in Chrome's shortcuts page where Chrome left Alt+Shift+N unassigned), types a new name, and presses Enter. The document gains exactly one line, after its last line that holds more than whitespace, formed per F12, and every other byte is unchanged. Typing that name in the popup and pressing Enter opens that page in a new tab; typing `j`, a space, and that name in the address bar and pressing Enter opens it too.
- Typing nonblank text that matches no mapping after `j` offers a search; Enter searches through Chrome's configured default engine in the current tab, a new foreground tab, or a new background tab as requested, without changing mappings or usage. Changing Chrome's default engine changes where the next search goes. Blank input opens nothing.
- With `yt` mapped to `https://www.youtube.com/results?search_query=%s`, typing `yt lo-fi beats` and Enter opens `https://www.youtube.com/results?search_query=lo-fi%20beats`; typing `yt` and Enter opens `https://www.youtube.com/results?search_query=`.
- In a 40-line document with comments, blank lines, tab-separated lines, and one line that is not a mapping, the user renames one mapping in the List view, then moves another mapping up past a heading. Apart from the line endings G12 moves, the document is the original with the renamed line rewritten and the moved line, byte for byte, in its new place; the non-mapping line is listed as unreadable and is unchanged; the moved mapping sits directly before the mapping that preceded it and no other mapping changed its place among the comment and blank lines.
- The Text view is open in a settings tab on a document with LF line endings, with an unsaved new line in the draft. In another window the user names the current page under a name the draft does not use. Back in the settings tab, Save reports the change and offers to bring it in; after accepting, Save stores a document holding both the named page's line and the draft's line, and nothing else differs from before.
- With a document that holds mappings, the popup open, and the box blank, Enter opens nothing. With a draft that holds a line with a name and no URL, Save stores nothing, the error names that line, and the draft is unchanged; the stored document is byte for byte what it was.

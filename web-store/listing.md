# Chrome Web Store listing

What the developer dashboard's fields hold for URLJumper, kept beside the images so a release can check the listing against the product. The images here are drawn by `node scripts/web-store-media.ts` from the built extension (`RELEASING.md` says when to redraw them); they were drawn with Inter and JetBrains Mono as the system's sans-serif and monospace fonts, and another machine's default fonts draw them differently. The store takes screenshots at 1280 by 800, the small promo tile at 440 by 280, and the marquee promo tile at 1400 by 560, each a JPEG or a 24-bit PNG without alpha; every image here is such a PNG.

## Store listing

**Name:** URLJumper. The dashboard takes it from the package's manifest.

**Summary:** the manifest's `description`, at most 132 characters:

> Open web pages by names you keep in one text document. Type a name, press Enter, arrive.

**Category:** Productivity. **Language:** English.

**Description:** the text below, pasted as it is. The store shows it as plain text and keeps line breaks.

```
URLJumper opens web pages by names you choose. Keep your mappings, each a name and a URL, in one plain-text document. Then, on any page, press Alt+N, type part of a name, and press Enter to arrive.

WHAT IT DOES

• Jump. Alt+N opens the popup; Alt+M opens it with Enter set to open in this tab instead of a new one. The matching mappings appear as you type, a name typed in full first. Enter opens the selected one, Shift+Enter opens it the other way, Up and Down move, Escape closes.

• Name this page. Press Alt+Shift+N, right-click a page or a link and choose Name this page (or Name this link) in URLJumper, or use the popup's Name this page button. Type a name, press Enter, and the line is written into your document. A name that is already taken is refused, with its line number and an offer to edit that mapping instead.

• Search through a name. Put %s in a URL, and what you type after the name goes there. With the line
  yt   https://www.youtube.com/results?search_query=%s
typing "yt lo-fi beats" and pressing Enter searches YouTube for lo-fi beats.

• Jump from the address bar. Type j, a space, and a name: Chrome lists your mappings in the order the popup would, and Enter opens the top one.

• Smart order, if you want it. Lists the mappings you used recently first. New installs start with it on; if you are upgrading from 1.x, your list keeps the order of your document until you turn it on in Preferences.

• Edit the way you like. The List view edits the document line by line: rename, delete, move, or copy a destination, each change saved at once with Undo. The Text view edits the whole document as text, and every error it finds names its line. Import and Export move the document as a .txt file.

• Light and dark theme, following your system or set by you. Everything works from the keyboard.

YOUR DOCUMENT

One mapping per line: a name, spaces, and a URL. A backslash starts a comment; a line that is only a comment is a section heading; a comment after a mapping is its note. Names can have spaces. A change made from the List view, the popup, or the Name form changes only the line it concerns and keeps every other line's text and spacing as you wrote it.

  \ Daily
  mail        https://mail.google.com/
  dashboard   http://192.168.1.136:8083/      \ the home server

  \ Search: type the name, a space, then what to look for
  yt          https://www.youtube.com/results?search_query=%s

PRIVATE BY DESIGN

Everything stays in your Chrome profile. URLJumper makes no network requests of its own and has no account, no sync, and no telemetry. It uses only these permissions: storage (your document and preferences), the active tab (the address and title of the page you are on, only when you open URLJumper on it), the clipboard (to copy a link), and the right-click menu.

UPGRADING FROM 1.x

Your mappings stay exactly as they were, and so do your theme and your shortcuts from any version since 1.1.0. The first popup after the update shows a one-line notice of what is new.

SHORTCUTS

Alt+N: open URLJumper; Enter opens in a new tab
Alt+M: open URLJumper; Enter opens in this tab
Alt+Shift+N: name this page
Change them at chrome://extensions/shortcuts. Where another program already uses a key, Chrome leaves that shortcut unassigned, and that page lets you choose one.

URLJumper is open source (MIT): https://github.com/BrianWeiHaoMa/URLJumper
Found a bug, or want something added? Open an issue there.

Developers: Brian Wei Hao Ma, Ryan B. Green
```

## Screenshots, in order

Each is a real capture of the built extension in Chromium at a display scale of 1.25, set in a captioned frame.

1. `screenshot-1-jump.png`: the popup over a page with `ma` typed, three matches, and the footer saying what Enter does.
2. `screenshot-2-name-this-page.png`: the Name form for the page the popup was opened on, with its title, host, URL, the Section choice, and the preview of the line to be written.
3. `screenshot-3-search-through-a-name.png`: `yt lo-fi beats` typed, and the argument row showing the filled YouTube search URL.
4. `screenshot-4-your-document.png`: the settings page's Text view, showing the document with comment headings, notes, and aligned columns.
5. `screenshot-5-list-view-dark.png`: the settings page's List view in the dark theme, rows under their heading with line numbers and a note.
6. `screenshot-6-address-bar.png`: Chrome's address bar in keyword mode after `j ma`, listing the same three matches.

The store takes five screenshots at most. Upload 1, 2, 3, 4, and 6: each shows a different way in or a different face of the document, and the address bar is the one Chrome draws itself. Screenshot 5 is the spare, for when the dark theme should be seen.

## Promo tiles

- `promo-small.png` (440 by 280): the icon, the name, and the tagline.
- `promo-marquee.png` (1400 by 560): the name, the tagline, three lines on what it does, and the popup as captured for the first screenshot.

## Privacy tab

**Single purpose:** URLJumper opens web pages by names the user keeps, with their URLs, in one plain-text document of their own.

**Permission justifications:**

- `storage`: holds the user's document, their learned usage for Smart order, their preferences, and an unsaved text draft, in the extension's local storage only.
- `activeTab`: reads the address and title of the page in front when the user opens the popup on it, names it, or copies its address; nothing is read without the user's own action.
- `clipboardWrite`: *Copy link* and *Copy tab URL* put a URL on the clipboard.
- `contextMenus`: the two right-click items, *Name this page in URLJumper* and *Name this link in URLJumper*.
- No host permissions. The keyboard commands and the address-bar keyword `j` are manifest declarations, not permissions.

**Remote code:** none. Every script is in the package; the content security policy allows the package's own origin only.

**Data use:** the extension collects no user data. Nothing the user types, saves, or opens leaves the machine except by the navigation they asked for; there is no server, account, sync, or telemetry.

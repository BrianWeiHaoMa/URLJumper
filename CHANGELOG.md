# Changelog

Every release of URLJumper, newest first. The version is `version` in `manifest.config.ts`. From 2.0.0 on, each release is tagged `v<version>`; the 1.x releases are tagged `v<version>-release`, and their entries are drawn from those tags and the commit messages of the time.

## 2.0.0 — 2026-10-20

Version 2.0 is a new implementation, built from `PRODUCT_SPECIFICATION.md` and `TECHNICAL_SPECIFICATION.md`; nothing of the 1.x code remains. An install of 1.x keeps its stored document byte for byte. From 1.1.0 on, 1.x stored the theme and named its commands as 2.0 does, so a user's theme and assigned shortcuts stay as well; 1.0.x used other names for both, and an update from one starts with the System theme and the suggested shortcuts.

### Added

- **Name this page**: Alt+Shift+N (suggested), the right-click items *Name this page in URLJumper* and *Name this link in URLJumper*, the popup's *Name this page* button, and the popup's last row when what is typed matches no name. A form writes one line into the document, at its end or in a chosen section, and offers Undo.
- **Argument aliases**: `%s` in a URL takes the text typed after the name, percent-encoded; without an argument, `%s` is removed.
- **Address-bar keyword** `j`: Chrome's address bar lists the mappings for the typed text in the popup's order, and Enter opens the selected one.
- **Smart order**: an optional search order that lists recently used mappings first, with *Reset learned order*. New installs start in it; an upgrade keeps Document order.
- **Address matches**: mappings whose URL contains the typed text, listed below the name matches.
- **List view**, in the popup's settings and on the settings page: the document line by line, with headings, notes, and line numbers; each row can be renamed, deleted, moved up or down, or have its destination copied, each change saved at once with Undo. A line the extension cannot read is shown as it is, with *Fix in text*.
- **Row editor** in the popup: the pencil on a row (or Ctrl+E on the selected row) opens name, URL, and note fields with *Save*, *Delete*, *Copy link*, and *Open in text*.
- **Text view**: Save lists every error with its line number and moves the caret to a line when its error is activated; a Save that finds the stored document changed elsewhere offers to bring the change in before anything is overwritten; an unsaved draft survives the popup closing and is offered back.
- A full settings page in a tab of its own (*Open in tab*), with Preferences, Import, and Export.
- **First run**: an empty document offers *Name this page* and *Load example mappings*.
- **Upgrade notice**: the first popup after an update from 1.x shows a one-line notice that opens a what's-new page.
- Every control can be reached with the keyboard and by a screen reader; text meets a 4.5:1 contrast ratio in both themes.

### Changed

- The extension is named **URLJumper** (it was *URL Jumper*) in the manifest and every string.
- A name typed in full is listed first, even when an earlier line's name starts with it.
- Whitespace at the end of the typed text is ignored.
- A URL containing `%s` is opened with `%s` filled or removed; 1.x opened it with `%s` literally.
- The popup opens in New tab mode from the toolbar button and Alt+N and in This tab mode from Alt+M, shown by a chip that a click flips; Shift+Enter and Shift+click open in the other mode. With the box blank, Enter opens nothing.
- The theme is chosen in Preferences as *System*, *Light*, or *Dark*.
- Chrome 127 or later is required.
- The `contextMenus` permission is added for the right-click items; it carries no install warning, so a user of 1.1.0 or later accepts nothing at the update. 1.0.x did not declare `clipboardWrite`, so an update from one may ask.

## 1.3.0 — 2026-07-02

- An edit button on the right of each suggested item.
- The Copy URL button moves the caret to the end of the mappings text only when the text area has not been focused yet.

## 1.2.3 — 2026-06-13

- At most seven suggestions at a time, down from eight, keeping the popup within Chrome's 600-pixel height limit.

## 1.2.2 — 2026-05-19

- The tab-mode label and the settings button swap places.

## 1.2.1 — 2026-05-18

- Names may contain spaces.
- A URL must start with a protocol.
- The Copy URL button moves to the bottom.

## 1.1.1 — 2026-05-12

- Suggestions matched inside a name are listed below those matched from its start; the selection wraps around at the ends; scrolling through the suggestions is smoother.

## 1.1.0 — 2026-05-12

- The suggestion window scrolls one row at a time.

## 1.0.5 — 2025-12-14

- The Jump and Jump to New Tab buttons use the first autocompleted name.

## 1.0.4 — 2025-03-14

- Documentation.

## 1.0.3 — 2025-01-01

- Scrollbars restyled in the text areas; the mappings text always ends with a newline.

## 1.0.2 — 2024-11-28

- Enter jumps to the first result at once.
- The current URL is copied to the clipboard by a button.

## 1.0.1 — 2024-11-15

- A text area in the settings for copying the current URL.

## 1.0.0 — 2024-11-15

- First release: a popup that opens a URL by its alias, with autocomplete, and a settings page holding the alias and URL pairs.

// What a settings view and its host agree on (G31; Composition, "Settings views"): each view is written once
// and shown by two hosts, the popup's settings and the options page, which give it only what is here. What
// differs by host is passed in, never worked out by the view. The options page opens on the view its
// fragment names (`#view=<id>`), with the Text view's caret on the line it names (`&line=N`); the popup's
// *Open in tab* names the view it shows, and its row editor's *Open in text* the Text view and the line. Both
// hosts show their own Text view on a line when the List view asks (`showTextView`), and let the view shown
// ask before another is shown in its place (`guardSwitch`).
import type { ComponentType, ReactNode } from 'react';

/** A file's text Import brings to the Text view as its draft (G20). */
export interface ImportedText {
  /** The file's text as `File.text()` read it (S14). */
  text: string;
  /** The file's name, which the Text view asks by before it replaces a kept draft with unsaved changes (G19). */
  fileName: string;
  /** When the user imported it, in milliseconds since the Unix epoch: the time of the edit it makes. */
  time: number;
}

export interface SettingsViewProps {
  /** What the host puts beside the view, below its own parts: on the options page, Export beside Preferences. */
  beside?: ReactNode;
  /** Called with what Enter does where the focus is in the view, whenever that changes; the popup's footer says it (L2). */
  sayWhatEnterDoes?(text: string): void;
  /**
   * On the options page opened at `#view=text&line=N`, or in either host after `showTextView(N)`, until another
   * view is shown: N, the stored document's line the Text view puts the caret on, with the focus, as it first
   * shows the document.
   */
  caretLine?: number;
  /** Shows the host's own Text view with the caret on the stored document's line N, as `caretLine` says: the List view's *Fix in text*. */
  showTextView?(line: number): void;
  /**
   * In the popup alone: the tab it was opened on, with its address when Chrome granted it (E5), which the
   * Text view's *Copy tab URL* copies, as do the ones in the List view's *Add mapping* form and row editor
   * (G31). Absent on the options page, which has no such tab.
   */
  openerTab?: { url: string | undefined };
  /**
   * Given by both hosts: the place in the host's header, at the top right, where the view puts its own controls,
   * drawn as icons: the List view's *Add mapping*. Null until the header is drawn, when the view shows none.
   */
  headerControls?: HTMLElement | null;
  /**
   * On the options page alone, after Import, until another view is shown: the file, whose text the Text view
   * takes as its draft, against the base it loads, as it first shows the document, once it has asked over a kept
   * draft with unsaved changes; nothing is stored until Save. The view is shown afresh for each Import.
   */
  imported?: ImportedText;
  /**
   * Given by both hosts: the view registers what it asks before the host shows another view in its place, as
   * it is shown, and withdraws it (null) as it goes; the host consults it on every switch away from the view.
   * The Text view's asks before a switch to the List view over unsaved changes (G19).
   */
  guardSwitch?(guard: SwitchGuard | null): void;
}

/** What a view asks before its host shows another view in its place (G19). */
export interface SwitchGuard {
  /**
   * Whether a switch to `to` asks the user first when there is something to ask, which the popup's footer says
   * on `to`'s button (L2): whether it asks now can change while the button has the focus, as a read lands.
   */
  mayAsk(to: SettingsView): boolean;
  /**
   * The user chose to show `to`: the view calls `proceed`, which shows it, at once when it has nothing to ask,
   * once the user answers to switch, or never, when they stay.
   */
  switching(to: SettingsView, proceed: () => void): void;
}

export interface SettingsView {
  /** The view's name in the options page's fragment. */
  id: string;
  title: string;
  View: ComponentType<SettingsViewProps>;
}

/** The view `hash`, a page's `location.hash`, names as `view=<id>`; the first of `views` when it names none of them. */
export function viewInFragment<V extends { id: string }>(hash: string, views: readonly [V, ...V[]]): V {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('view');
  return views.find((view) => view.id === id) ?? views[0];
}

/**
 * The line `hash` names as `line=<N>`: decimal digits naming a number from 1; undefined for anything else, a
 * sign, an exponent, or nothing, which the Text view ignores.
 */
export function lineInFragment(hash: string): number | undefined {
  const line = new URLSearchParams(hash.replace(/^#/, '')).get('line');
  if (line === null || !/^[0-9]+$/.test(line)) return undefined;
  const number = Number(line);
  return number >= 1 ? number : undefined;
}

/** The fragment that opens the options page on the view `id`, and for the Text view with its caret on `line` when given. */
export function settingsFragment(id: string, line?: number): string {
  return `#${new URLSearchParams({ view: id, ...(line === undefined ? {} : { line: `${line}` }) })}`;
}

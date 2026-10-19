// What a settings view and its host agree on (G31; Composition, "Settings views"): each view is written once
// and shown by two hosts, the popup's settings and the options page, which give it only what is here. What
// differs by host is passed in, never worked out by the view. The options page opens on the view its
// fragment names (`#view=<id>`), with the Text view's caret on the line it names (`&line=N`); the popup's
// *Open in tab* names the view it shows.
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
   * On the options page opened at `#view=text&line=N`, until another view is shown: N, the stored document's
   * line the Text view puts the caret on, with the focus, as it first shows the document.
   */
  caretLine?: number;
  /**
   * In the popup alone: the tab it was opened on, with its address when Chrome granted it (E5), which the
   * Text view's *Copy tab URL* copies (G31). Absent on the options page, which has no such tab.
   */
  openerTab?: { url: string | undefined };
  /**
   * On the options page alone, after Import, until another view is shown: the file, whose text the Text view
   * takes as its draft, against the base it loads, as it first shows the document, once it has asked over a kept
   * draft with unsaved changes; nothing is stored until Save. The view is shown afresh for each Import.
   */
  imported?: ImportedText;
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

/** The fragment that opens the options page on the view `id`. */
export function settingsFragment(id: string): string {
  return `#${new URLSearchParams({ view: id })}`;
}

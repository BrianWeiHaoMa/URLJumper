// What a settings view and its host agree on (G31; Composition, "Settings views"): each view is written once
// and shown by two hosts, the popup's settings and the options page, which give it only what is here. What
// differs by host is passed in, never worked out by the view. The options page opens on the view its
// fragment names (`#view=<id>`); the popup's *Open in tab* names the view it shows.
import type { ComponentType, ReactNode } from 'react';

export interface SettingsViewProps {
  /** What the host puts beside the view, below its own parts: on the options page, Export beside Preferences. */
  beside?: ReactNode;
  /** Called with what Enter does where the focus is in the view, whenever that changes; the popup's footer says it (L2). */
  sayWhatEnterDoes?(text: string): void;
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

/** The fragment that opens the options page on the view `id`. */
export function settingsFragment(id: string): string {
  return `#${new URLSearchParams({ view: id })}`;
}

// The document and its learned usage as stored (F3; State): `mappings`, the document as one string, and
// `usage`, an object keyed by mapping key. Only the service worker writes them (R1); the popup, the settings
// views, and the worker all read them through these, so every surface sees the same document and usage, and
// the popup's list and the address bar's are built from the same inputs (How G1, G2, G28). Reading never
// stores what it found, and says nothing about the document's text, which is the document module's (R2).
import type { Usage } from './document/score';

/** `mappings` as stored: the string exactly as Chrome holds it; absence, and anything but a string, is the empty document. */
export function readMappings(mappings: unknown): string {
  return typeof mappings === 'string' ? mappings : '';
}

/** `usage` as stored: the object itself; absence, and anything but a non-null object, is no learned usage. */
export function readUsage(usage: unknown): Usage | undefined {
  return typeof usage === 'object' && usage !== null ? (usage as Usage) : undefined;
}

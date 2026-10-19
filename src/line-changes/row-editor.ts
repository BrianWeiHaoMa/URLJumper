// The row editor's rules (G13, G14, G31, L2), pure, for `RowEditor.tsx`: the fields a line fills, what Save
// would write and what stops it, what became of a line a change found stale, the line *Open in text* names,
// and the destination *Copy link* copies. Every rule about the document's text they rest on is the document
// module's (R2).
import { anchorAt, findAnchor, type Anchor } from '../document/anchor';
import { fillArgument } from '../document/argument';
import { mappingOfLine, readDocument, type Mapping } from '../document/grammar';
import { insertionPoint } from '../document/insertion';
import { rewriteChecks } from '../document/rewriting';
import { checkMapping, holderOfName, type FieldProblem, type MappingFields } from '../document/validation';

/** The fields an editor opened on the line whose exact text is `text` starts with: its name, URL, and note, empty for none. */
export function lineFields(text: string): MappingFields {
  const mapping = mappingOfLine(text);
  return { name: mapping?.name ?? '', url: mapping?.url ?? '', note: mapping?.note ?? '' };
}

/**
 * What Save of `fields` would write: over the line `anchor` names, or, with no anchor, a new line at the end
 * of the document (G9). `line` is the line it would be; `problem` and `takenBy` what stops it, as the worker
 * checks them against `document`, the stored document as last read, both at once (G8). `stale` says the
 * document as last read no longer holds the anchor, where nothing stops Save and the worker says so.
 */
export interface SaveCheck {
  line: number;
  problem: FieldProblem | null;
  takenBy: Mapping | null;
  stale: boolean;
}

export function saveCheck(document: string, anchor: Anchor | null, fields: MappingFields): SaveCheck {
  if (anchor === null) {
    const { lines, mappings } = readDocument(document);
    return { line: insertionPoint(lines, null).after + 1, ...checkMapping(fields, mappings), stale: false };
  }
  const checks = rewriteChecks(document, anchor, fields);
  if (checks.kind === 'stale') return { line: anchor.line, ...checkMapping(fields, []), stale: true };
  return { line: checks.line, problem: checks.problem, takenBy: checks.takenBy, stale: false };
}

/**
 * What became of the line an editor loaded as `loaded`, by `document`, the stored document a change was
 * refused against (G13): `changed`, anchored on the mapping line that now has the name it loaded, as names
 * compare, as that line now stands; else `gone`, never the line now at the old number.
 */
export type Became = { kind: 'changed'; now: Anchor } | { kind: 'gone' };

export function whatBecameOf(document: string, loaded: Anchor): Became {
  const name = mappingOfLine(loaded.text)?.name;
  const holder = name === undefined ? undefined : holderOfName(readDocument(document).mappings, name);
  const now = holder === undefined ? undefined : anchorAt(document, holder.line);
  return now === undefined ? { kind: 'gone' } : { kind: 'changed', now };
}

/** The line *Open in text* names: where the anchored line stands in `document` as last read, found again by its text, else the number it was loaded with. */
export function textViewLine(document: string, anchor: Anchor): number {
  return findAnchor(readDocument(document).lines, anchor.line, anchor.text) ?? anchor.line;
}

/**
 * The destination *Copy link* copies (G31): the URL opening the row navigates to, from the anchored line as
 * loaded, never from values typed and not saved: for the argument row, filled with its argument; for any
 * other, with every `%s` removed (F9, G6). Undefined when that is longer than Chrome opens (E7).
 */
export function destination(text: string, argument: string | null): string | undefined {
  const url = mappingOfLine(text)?.url;
  return url === undefined ? undefined : fillArgument(url, argument ?? '');
}

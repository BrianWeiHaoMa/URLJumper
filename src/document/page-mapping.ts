// The mapping a page already has (G10): the first mapping line, in document order, whose URL equals the
// page's address exactly, with nothing normalized (`https://a.example` is not `https://a.example/`).
import type { Mapping } from './grammar';

export function mappingOfPage(mappings: readonly Mapping[], address: string): Mapping | undefined {
  return mappings.find((mapping) => mapping.url === address);
}

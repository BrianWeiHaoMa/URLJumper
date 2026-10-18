// Argument aliases: `%s` in a mapping's URL marks where the text typed after its name goes (F4, F9).

export function isArgumentAlias(url: string): boolean {
  return url.includes('%s');
}

/** The longest URL Chrome navigates to (E7), in UTF-16 code units as `String.prototype.length` counts them. */
const LONGEST_URL = 2_097_152;

/**
 * The URL with the argument put in place of every `%s`, percent-encoded as a URI component, so a space
 * becomes `%20` (F9); an empty argument removes every `%s`. A lone surrogate is encoded as U+FFFD, where
 * `encodeURIComponent` alone would throw. The substituted text is not searched for `%s` again.
 * Undefined when the filled URL would be longer than `LONGEST_URL`, where G1 (c) offers no argument row.
 * Its length is found before it is built, so no argument, however long, builds a longer string: many `%s`
 * and a long argument reach far past what a string can hold inside E3.
 */
export function fillArgument(url: string, argument: string): string | undefined {
  const pieces = url.split('%s');
  const slots = pieces.length - 1;
  if (slots === 0) return url.length > LONGEST_URL ? undefined : url;
  // Encoding never shortens the argument, so one longer than the limit is too long before it is encoded.
  if (argument.length > LONGEST_URL) return undefined;
  const encoded = encodeURIComponent(argument.toWellFormed());
  if (url.length - 2 * slots + slots * encoded.length > LONGEST_URL) return undefined;
  return pieces.join(encoded);
}

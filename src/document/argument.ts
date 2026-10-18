// Argument aliases: `%s` in a mapping's URL marks where the text typed after its name goes (F4, F9).

export function isArgumentAlias(url: string): boolean {
  return url.includes('%s');
}

/**
 * The URL with the argument put in place of every `%s`, percent-encoded as a URI component, so a space
 * becomes `%20` (F9); an empty argument removes every `%s`. A lone surrogate is encoded as U+FFFD, where
 * `encodeURIComponent` alone would throw. The substituted text is not searched for `%s` again.
 * Undefined when the filled URL is longer than a string can be, which many `%s` and a long argument reach
 * inside E3 (a 128 KB URL of `%s` and a 64 KB argument fill 4 billion characters); such a URL is far past
 * the 2,097,152 characters Chrome navigates to (E7).
 */
export function fillArgument(url: string, argument: string): string | undefined {
  const encoded = encodeURIComponent(argument.toWellFormed());
  try {
    return url.split('%s').join(encoded);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return undefined;
  }
}

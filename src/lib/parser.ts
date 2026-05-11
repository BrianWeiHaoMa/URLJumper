export type Mapping = {
  name: string;
  url: string;
  line: number;
};

export type ParseError = {
  line: number;
  message: string;
};

export type ParseResult = {
  mappings: Mapping[];
  errors: ParseError[];
};

const COMMENT_CHAR = '\\';

function stripComment(line: string): string {
  const idx = line.indexOf(COMMENT_CHAR);
  return idx === -1 ? line : line.slice(0, idx);
}

export function parseMappings(text: string): ParseResult {
  const errors: ParseError[] = [];
  const mappings: Mapping[] = [];
  const seen = new Map<string, number>();

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const raw = lines[i] ?? '';
    const stripped = stripComment(raw).trim();
    if (stripped === '') continue;

    const tokens = stripped.split(/\s+/);

    if (tokens.length === 1) {
      errors.push({
        line: lineNumber,
        message: `Expected "name URL" but found a single token "${tokens[0]}". Each mapping needs an alias and a URL separated by whitespace.`,
      });
      continue;
    }

    if (tokens.length > 2) {
      errors.push({
        line: lineNumber,
        message: `Expected "name URL" but found ${tokens.length} tokens. Aliases cannot contain spaces, and each line must have exactly one alias and one URL.`,
      });
      continue;
    }

    const [name, url] = tokens as [string, string];

    const key = name.toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      errors.push({
        line: lineNumber,
        message: `Duplicate alias "${name}" (also defined on line ${previous}). Aliases are case-insensitive.`,
      });
      continue;
    }

    seen.set(key, lineNumber);
    mappings.push({ name, url, line: lineNumber });
  }

  return { mappings, errors };
}

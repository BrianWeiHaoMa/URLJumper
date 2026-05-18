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
export const URL_SCHEME_RE = /^[a-z][a-z\d+.-]*:/i;

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
    const noComment = stripComment(raw).replace(/\s+$/, '');
    const leftIdx = noComment.search(/\S/);
    if (leftIdx === -1) continue;

    const content = noComment.slice(leftIdx);
    const trailing = content.match(/\s+\S+$/);
    if (!trailing) {
      errors.push({
        line: lineNumber,
        message: `Expected "name URL" but found a single token "${content}". Each mapping needs a name and a URL separated by whitespace.`,
      });
      continue;
    }

    const sepStart = content.length - trailing[0].length;
    const urlOffsetInSep = trailing[0].search(/\S/);
    const name = content.slice(0, sepStart);
    const url = content.slice(sepStart + urlOffsetInSep);

    if (!URL_SCHEME_RE.test(url)) {
      errors.push({
        line: lineNumber,
        message: `Expected a valid URL but found "${url}". URLs must include a scheme (e.g., https://, http://, ftp://...).`,
      });
      continue;
    }

    const key = name.toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      errors.push({
        line: lineNumber,
        message: `Duplicate name "${name}" (also defined on line ${previous}). Names are case-insensitive.`,
      });
      continue;
    }

    seen.set(key, lineNumber);
    mappings.push({ name, url, line: lineNumber });
  }

  return { mappings, errors };
}

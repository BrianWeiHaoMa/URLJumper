import { expect, test } from 'vitest';
import { refusedValuesText } from './field-problems';

test("the worker's refusal of the values names the line that has the name, or the rule and the line the values are for (G8, G14)", () => {
  expect(refusedValuesText({ kind: 'name-taken', line: 7 }, 12, 'https://s.example/')).toBe('Not saved: line 7 already has this name.');
  expect(refusedValuesText({ kind: 'invalid', field: 'url', rule: 'no-scheme' }, 12, 's.example')).toBe('Not saved: Line 12: a URL must begin with a scheme, such as https:');
  expect(refusedValuesText({ kind: 'invalid', field: 'url', rule: 'no-scheme' }, 12, '')).toBe('Not saved: Line 12 needs a URL.');
  expect(refusedValuesText({ kind: 'invalid', field: 'name', rule: 'backslash' }, 3, 'https://s.example/')).toBe('Not saved: Line 3: a name cannot contain a backslash (\\), which starts a comment.');
});

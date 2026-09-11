import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { convert } from '../src/core/convert.js';

const base = new URL('./fixtures/', import.meta.url);
const read = path => readFileSync(new URL(path, base), 'utf8');
const diagnostic = ({ code, itemIndex }) => ({ code, ...(itemIndex === undefined ? {} : { itemIndex }) });

for (const category of readdirSync(base)) {
  for (const name of readdirSync(new URL(category + '/', base))) {
    const path = join(category, name);
    it(`fixture: ${path}`, () => {
      const expected = JSON.parse(read(`${path}/expected.json`));
      const result = convert(read(`${path}/input.html`), { mode: expected.mode });
      const actual = {
        mode: expected.mode, ok: result.ok, profileId: result.profileId,
        warnings: result.warnings.map(diagnostic),
        ...(!result.ok ? { error: diagnostic(result.error) } : {}),
      };
      expect(actual).toEqual(expected);
      if (expected.ok) expect(result.markdown).toBe(read(`${path}/expected.md`));
      else {
        expect(result).not.toHaveProperty('markdown');
        expect(result).not.toHaveProperty('document');
      }
    });
  }
}

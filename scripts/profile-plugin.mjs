import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { validateProfiles } from '../src/core/profile-schema.js';
import { hookRegistry } from '../src/hooks/chatgpt.js';

export function profileModule(source) {
  const profile = parse(source);
  validateProfiles([profile], hookRegistry);
  return `export default ${JSON.stringify(profile)};`;
}

export const esbuildProfiles = {
  name: 'yaml-profiles',
  setup(build) {
    build.onLoad({ filter: /\.yaml$/ }, async ({ path }) => ({
      contents: profileModule(await readFile(path, 'utf8')), loader: 'js',
    }));
  },
};

export const viteProfiles = {
  name: 'yaml-profiles',
  transform(source, id) { if (id.endsWith('.yaml')) return { code: profileModule(source), map: null }; },
};

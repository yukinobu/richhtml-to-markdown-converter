import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { validateProfiles } from '../src/core/profile-schema.ts';
import { hookRegistry } from '../src/hooks/chatgpt.ts';
import type { Plugin as EsbuildPlugin } from 'esbuild';
import type { Plugin as VitePlugin } from 'vite';

export function profileModule(source: string) {
  const profile: unknown = parse(source);
  validateProfiles([profile], hookRegistry);
  return `export default ${JSON.stringify(profile)};`;
}

export const esbuildProfiles: EsbuildPlugin = {
  name: 'yaml-profiles',
  setup(build) {
    build.onLoad({ filter: /\.yaml$/ }, async ({ path }) => ({
      contents: profileModule(await readFile(path, 'utf8')), loader: 'js',
    }));
  },
};

export const viteProfiles: VitePlugin = {
  name: 'yaml-profiles',
  transform(source, id) { if (id.endsWith('.yaml')) return { code: profileModule(source), map: null }; },
};

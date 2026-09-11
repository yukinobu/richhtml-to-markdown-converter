import { defineConfig } from 'vitest/config';
import { viteProfiles } from './scripts/profile-plugin.ts';

export default defineConfig({ plugins: [viteProfiles], test: { include: ['test/**/*.test.ts'] } });

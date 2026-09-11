import { defineConfig } from 'vitest/config';
import { viteProfiles } from './scripts/profile-plugin.mjs';

export default defineConfig({ plugins: [viteProfiles], test: { include: ['test/**/*.test.js'] } });

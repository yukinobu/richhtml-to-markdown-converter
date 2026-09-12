import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { esbuildProfiles } from './profile-plugin.ts';
import { validateProfiles } from '../src/core/profile-schema.ts';
import { hookRegistry } from '../src/hooks/chatgpt.ts';

// Validate the exact registered set, including duplicate IDs, before bundling UI.
const validation = await build({ entryPoints: ['src/profiles/index.ts'], bundle: true, write: false, format: 'esm', plugins: [esbuildProfiles] });
const { profiles }: { profiles: unknown } = await import(`data:text/javascript;base64,${Buffer.from(validation.outputFiles[0].text).toString('base64')}`);
validateProfiles(profiles, hookRegistry);

const [bundle, template, css, licenses] = await Promise.all([
  build({ entryPoints: ['src/browser/app.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', target: ['chrome100'], minify: true, legalComments: 'inline', plugins: [esbuildProfiles] }),
  readFile('src/index.template.html', 'utf8'),
  readFile('src/style.css', 'utf8'),
  readFile('THIRD-PARTY-NOTICES.txt', 'utf8'),
]);
const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const hash = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const csp = `default-src 'none'; script-src ${hash(script)}; style-src ${hash(css)}; connect-src 'none'; img-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
const html = template.replace('__CSP__', csp).replace('__STYLE__', () => css).replace('__SCRIPT__', () => script)
  + `\n<!-- Third-party notices\n${licenses.replace(/--/g, '—')}\n-->\n`;
await mkdir('dist', { recursive: true });
await writeFile('dist/rich-html-to-markdown.html', html);
console.log(`Built dist/rich-html-to-markdown.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);

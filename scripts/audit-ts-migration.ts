// One-off migration audit. Uses only local Git history and installed tools.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { transform } from 'esbuild';

const root = process.cwd();
const baseline = 'f3940c09594960f53a3c04055b562dc9c6215c31';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root });
const paths = (output: Buffer) => output.toString().split('\0').filter(Boolean).sort();
const files = paths(git('ls-tree', '-r', '--name-only', '-z', baseline, '--', 'test'));
const fixtures = files.filter(file => file.startsWith('test/fixtures/'));
assert.deepEqual(paths(git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'test/fixtures')), fixtures);
mkdirSync(join(root, 'tmp'), { recursive: true });
const work = mkdtempSync(join(root, 'tmp/ts-migration-audit-'));
const legacy = join(work, 'legacy');
const save = (path: string, content: string | Buffer) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};
save(join(work, 'worktree.diff'), git('diff', 'HEAD', '--', 'src', 'scripts', 'test', 'package.json'));
const compiler = { loader: 'ts', target: 'esnext', format: 'esm', treeShaking: false, charset: 'utf8' } as const;
const imports = (source: string) => source
  .replace(/(from ['"]\.\.?\/[^'"\n]+)\.(?:mjs|js)(['"])/g, '$1.ts$2')
  .replace("['src/core/convert.js']", "['src/core/convert.ts']");
let hookConnections = 0;
for (const file of files) {
  const original = git('show', `${baseline}:${file}`);
  save(join(work, 'original', file), original);
  if (!file.endsWith('.js')) {
    assert.ok(original.equals(readFileSync(join(root, file))), `Changed fixture: ${file}`);
    save(join(legacy, file), original);
    continue;
  }
  // Only change imports and the two injected hook registrations. Inputs,
  // matchers, expected values and test bodies otherwise remain the old JS.
  let connected = imports(original.toString());
  connected = connected.split('\n').map(line => {
    if (!line.includes('const custom = createConverter(profiles, { ...hookRegistry, chatgptNormalizeContent()')) return line;
    assert.ok(line.endsWith('} });'));
    hookConnections++;
    return line.replace('...hookRegistry, chatgptNormalizeContent()', '...hookRegistry, normalizeContent: { chatgptNormalizeContent()')
      .replace(/\} \}\);$/, '} } });');
  }).join('\n');
  save(join(legacy, file), connected);
  // Strip types and normalize formatting with the same compiler on both sides.
  // Keep all runtime differences visible; do not erase added assertions.
  for (const [side, source] of [
    ['before', imports(original.toString())],
    ['after', readFileSync(join(root, file.replace(/\.js$/, '.ts')), 'utf8')],
  ]) {
    const { code } = await transform(source, compiler);
    save(join(work, side, file), code);
  }
}
assert.equal(hookConnections, 2);
save(join(work, 'after/test/assertions.js'), (await transform(readFileSync(join(root, 'test/assertions.ts'), 'utf8'), compiler)).code);
const diff = (before: string, after: string, output: string) => {
  const result = spawnSync('git', ['diff', '--no-index', '--', before, after], { cwd: work, encoding: 'utf8' });
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  save(join(work, output), result.stdout);
};
diff('original/test', 'legacy/test', 'legacy-connections.diff');
diff('before/test', 'after/test', 'runtime.diff');
for (const directory of ['src', 'scripts', 'dist']) symlinkSync(join(root, directory), join(legacy, directory), 'dir');
for (const file of ['package.json', 'vitest.config.js', 'playwright.config.js']) {
  save(join(legacy, file), imports(git('show', `${baseline}:${file}`).toString()));
}

const run = (cwd: string, executable: string, args: string[], log: string, env = process.env) => {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', env });
  save(join(work, log), (result.stdout ?? '') + (result.stderr ?? ''));
  assert.equal(result.status, 0, `Failed: ${args.join(' ')}; see ${join(work, log)}`);
};
run(root, 'npm', ['run', 'build'], 'build.log');
const summary = { baseline, head: git('rev-parse', 'HEAD').toString().trim(), node: process.version, fixtures: fixtures.length, runs: [] as object[] };
let legacyCases: string[] = [];
for (const [label, cwd] of [['legacy', legacy], ['current', root]]) {
  const unitReport = join(work, `${label}-unit.json`);
  const browserReport = join(work, `${label}-browser.json`);
  run(cwd, process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--reporter=json', '--outputFile', unitReport], `${label}-unit.log`);
  run(cwd, process.execPath, [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', '--reporter=json'], `${label}-browser.log`, { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: browserReport });
  const unit = JSON.parse(readFileSync(unitReport, 'utf8'));
  const browser = JSON.parse(readFileSync(browserReport, 'utf8'));
  assert.equal(unit.numPendingTests, 0);
  assert.equal(unit.numFailedTests, 0);
  assert.equal(browser.stats.skipped, 0);
  assert.equal(browser.stats.unexpected, 0);
  assert.equal(browser.stats.flaky, 0);
  if (label === 'legacy') {
    assert.equal(unit.numPassedTests, 142);
    assert.equal(browser.stats.expected, 12);
  }
  const cases: string[] = unit.testResults.flatMap((suite: { name: string; assertionResults: { fullName: string }[] }) =>
    suite.assertionResults.map(test => `${basename(suite.name).replace(/\.ts$/, '.js')}: ${test.fullName}`));
  if (label === 'legacy') legacyCases = cases;
  else {
    const added = [...cases];
    for (const name of legacyCases) {
      const index = added.indexOf(name);
      assert.ok(index >= 0, `Missing legacy test case: ${name}`);
      added.splice(index, 1);
    }
    save(join(work, 'case-diff.json'), JSON.stringify({ removed: [], added }, null, 2) + '\n');
  }
  summary.runs.push({ label, unit: unit.numPassedTests, browser: browser.stats.expected });
}
save(join(work, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.log(`Evidence: ${work}`);

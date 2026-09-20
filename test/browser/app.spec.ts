import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { esbuildProfiles } from '../../scripts/profile-plugin.ts';
import type { Page } from '@playwright/test';
import type { convert } from '../../src/core/convert.ts';
import { success } from '../assertions.ts';

declare global {
  interface Window {
    copied?: string;
    inputExecuted?: boolean;
    violations: string[];
    TestConverter: { convert: typeof convert };
  }
}

const appUrl = pathToFileURL(resolve('dist/richhtml-to-markdown.html')).href;

async function paste(page: Page, formats: Record<string, string>) {
  await page.locator('#input').evaluate((input, formats) => {
    const clipboardData = new DataTransfer();
    for (const [mime, data] of Object.entries(formats)) clipboardData.setData(mime, data);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, formats);
}
async function source(page: Page, html = '<p>hello</p>') {
  await page.locator('#input-method').selectOption('source');
  await page.locator('#input').fill(html);
  await page.locator('#convert').click();
}

test.beforeEach(async ({ page }) => { await page.goto(appUrl); });

test('opens the standalone file with no external assets and converts rich HTML only on click', async ({ page }) => {
  await expect(page.locator('#input')).toHaveAttribute('readonly', '');
  await expect(page.locator('#input-method')).toHaveValue('rich');
  await expect(page.locator('#mode')).toHaveValue('auto');
  await expect(page.locator('#copy')).toBeDisabled();
  expect(await page.locator('script[src], link[rel=stylesheet], iframe').count()).toBe(0);
  await paste(page, { 'text/html': '<h1>Rich</h1>', 'text/plain': 'plain' });
  await expect(page.locator('#input')).toHaveValue('<h1>Rich</h1>');
  await expect(page.locator('#output')).toHaveValue('');
  await page.locator('#convert').click();
  await expect(page.locator('#output')).toHaveValue('# Rich\n');
  await expect(page.locator('#detected')).toHaveText('採用Profile: Generic HTML');
});

test('rejects missing or blank rich HTML without changing previous data', async ({ page }) => {
  await paste(page, { 'text/html': '<p>keep</p>' });
  await page.locator('#convert').click();
  const missingHtml: Record<string, string>[] = [{ 'text/plain': 'hello' }, { 'text/html': ' \n' }];
  for (const formats of missingHtml) {
    await paste(page, formats);
    await expect(page.locator('#input-error')).toContainText('HTMLソース');
    await expect(page.locator('#input')).toHaveValue('<p>keep</p>');
    await expect(page.locator('#output')).toHaveValue('keep\n');
    await expect(page.locator('#copy')).toBeEnabled();
  }
});

test('accepts source text, ignores HTML MIME, replaces the whole input and clears results', async ({ page }) => {
  await source(page);
  await paste(page, { 'text/plain': 'hello', 'text/html': '<h1>ignored</h1>' });
  await expect(page.locator('#input')).toHaveValue('hello');
  await expect(page.locator('#output')).toHaveValue('');
  await expect(page.locator('#detected')).toBeEmpty();
  await expect(page.locator('#copy')).toBeDisabled();
  await page.locator('#convert').click();
  await expect(page.locator('#output')).toHaveValue('hello\n');
  await paste(page, { 'text/html': '<p>missing plain</p>' });
  await expect(page.locator('#input-error')).not.toBeEmpty();
  await expect(page.locator('#output')).toHaveValue('hello\n');
});

test('input edits and mode changes clear results; input method changes also clear source', async ({ page }) => {
  await source(page);
  await page.locator('#input').fill('<p>edited</p>');
  await expect(page.locator('#output')).toHaveValue('');
  await page.locator('#convert').click();
  await page.locator('#mode').selectOption('generic-html');
  await expect(page.locator('#input')).toHaveValue('<p>edited</p>');
  await expect(page.locator('#output')).toHaveValue('');
  await page.locator('#convert').click();
  await page.locator('#input-method').selectOption('rich');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('#output')).toHaveValue('');
  await expect(page.locator('#detected')).toBeEmpty();
});

test('empty conversion errors have no output', async ({ page }) => {
  await page.locator('#convert').click();
  await expect(page.locator('#conversion-error')).toContainText('HTMLを入力');
  await expect(page.locator('#output')).toHaveValue('');
  await expect(page.locator('#copy')).toBeDisabled();
});

test('shows the adopted profile on failure and allows explicit manual mode change', async ({ page }) => {
  await page.locator('#mode').selectOption('chatgpt-conversation');
  await source(page, '<article>article</article>');
  await expect(page.locator('#conversion-error')).toContainText('メッセージを検出できません');
  await expect(page.locator('#detected')).toContainText('ChatGPT Conversation');
  await page.locator('#mode').selectOption('generic-html');
  await expect(page.locator('#conversion-error')).toBeEmpty();
  await page.locator('#convert').click();
  await expect(page.locator('#output')).toHaveValue('article\n');
});

test('warnings do not prevent copying and only Markdown is copied', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { window.copied = text; } } });
  });
  await source(page, '<section data-testid="conversation-turn-5" data-turn="user"><div data-message-author-role="user">question</div></section>');
  await expect(page.locator('#warnings li')).toHaveCount(2);
  await page.locator('#copy').click();
  const markdown = await page.locator('#output').inputValue();
  expect(await page.evaluate(() => window.copied)).toBe(markdown);
  expect(markdown).toBe('---\nsource: chatgpt\ntype: conversation\n---\n\n## User\n\nquestion\n');
  await expect(page.locator('#copy-status')).toContainText('コピーしました');
  await page.locator('#input').fill('edited');
  await expect(page.locator('#warnings')).toBeEmpty();
  await expect(page.locator('#copy-status')).toBeEmpty();
});

for (const behavior of ['absent', 'reject']) {
  test(`copy ${behavior} selects output for manual copying`, async ({ page }) => {
    await page.evaluate(behavior => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: behavior === 'absent' ? undefined : { writeText: async () => { throw new Error('denied'); } } });
    }, behavior);
    await source(page);
    await page.locator('#copy').click();
    await expect(page.locator('#copy-status')).toContainText('Ctrl+C');
    await expect(page.locator('#output')).toHaveValue('hello\n');
    await expect(page.locator('#output')).toBeFocused();
    expect(await page.locator('#output').evaluate((output: HTMLTextAreaElement) => [output.selectionStart, output.selectionEnd])).toEqual([0, 6]);
  });
}

const hostile = `<body onload="window.inputExecuted=true" style="background:url(https://example.com/background)">
  <script>window.inputExecuted=true;fetch('https://example.com/script')</script>
  <script src="https://example.com/external.js"></script>
  <link rel="stylesheet" href="https://example.com/style.css"><base href="https://example.com/">
  <meta http-equiv="refresh" content="0;url=https://example.com/refresh">
  <iframe src="https://example.com/frame" srcdoc="<script>parent.inputExecuted=true</script>"></iframe>
  <object data="https://example.com/object"></object><embed src="https://example.com/embed">
  <svg><image href="https://example.com/svg"></image></svg>
  <template><img src="https://example.com/template"></template>
  <article><p onclick="window.inputExecuted=true">safe</p>
  <img src="https://example.com/image" srcset="https://example.com/other 2x" onerror="window.inputExecuted=true" alt="image">
  <video poster="https://example.com/poster" src="https://example.com/video"></video>
  <audio src="https://example.com/audio"></audio><input type="image" src="https://example.com/input">
  <p hidden>hidden</p><p aria-hidden="true">also hidden</p></article></body>`;

test('startup, paste, convert and copy make no resource requests or execute input', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    window.violations = [];
    document.addEventListener('securitypolicyviolation', event => window.violations.push(event.blockedURI));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { window.copied = text; } } });
  });
  await page.reload();
  await paste(page, { 'text/html': hostile, 'text/plain': 'ignored' });
  await page.locator('#convert').click();
  await page.locator('#copy').click();
  await expect(page.locator('#output')).toHaveValue('safe\n\n![image](<https://example.com/image>)\n');
  expect(await page.evaluate(() => window.inputExecuted)).toBeUndefined();
  expect(await page.evaluate(() => window.violations)).toEqual([]);
  expect(requests.filter(url => url !== appUrl)).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
});

test('the parser remains inert even without CSP', async ({ page }) => {
  const result = await build({ entryPoints: ['src/core/convert.ts'], bundle: true, write: false, format: 'iife', globalName: 'TestConverter', plugins: [esbuildProfiles] });
  await page.goto('about:blank');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.addScriptTag({ content: result.outputFiles[0].text });
  const converted = await page.evaluate(html => window.TestConverter.convert(html), hostile);
  expect(converted.ok).toBe(true);
  expect(success(converted).markdown).toBe('safe\n\n![image](<https://example.com/image>)\n');
  expect(await page.evaluate(() => window.inputExecuted)).toBeUndefined();
  expect(requests).toEqual([]);
});

test('converts captured ChatGPT structures through the standalone HTML without resource requests', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.locator('#input-method').selectOption('source');
  for (const fixture of ['code-viewer-2026-09', 'user-lines-2026-09', 'citation-2026-09', 'readable-output-2026-09']) {
    const path = `test/fixtures/chatgpt/${fixture}`;
    await paste(page, { 'text/plain': readFileSync(`${path}/input.html`, 'utf8') });
    await page.locator('#convert').click();
    await expect(page.locator('#output')).toHaveValue(readFileSync(`${path}/expected.md`, 'utf8'));
    await expect(page.locator('#detected')).toHaveText('採用Profile: ChatGPT Conversation');
  }
  expect(requests).toEqual([]);
});

const collectionTurn = (number: number, text = `本文${number}`, id = `message-${number}`) =>
  `<article data-testid="conversation-turn-${number}" data-turn="user"><div data-message-author-role="user" data-message-id="${id}"><p>${text}</p></div></article>`;

async function collect(page: Page) {
  await page.locator('#workflow').selectOption('collect');
  await page.locator('#input-method').selectOption('source');
}

test('collects on paste, shows gap context, fills gaps and copies accumulated Markdown', async ({ page }) => {
  await collect(page);
  await expect(page.locator('#mode')).toHaveValue('chatgpt-conversation');
  await expect(page.locator('#mode')).toBeDisabled();
  await paste(page, { 'text/plain': collectionTurn(1, '最初の質問') + collectionTurn(4, '最後の質問') });
  await expect(page.locator('#collection-count')).toHaveText('取得済み：2件');
  await expect(page.locator('#collection-ranges')).toHaveText('取得範囲：1、4');
  await expect(page.locator('#collection-missing')).toContainText('未取得：2〜3');
  await expect(page.locator('#collection-gaps')).toContainText('最初の質問');
  await expect(page.locator('#collection-gaps')).toContainText('最後の質問');
  expect(await page.locator('#output').inputValue()).toContain('最初の質問');
  await expect(page.locator('#copy')).toBeEnabled();
  await paste(page, { 'text/plain': collectionTurn(2) + collectionTurn(3) + collectionTurn(4, '最後の質問') });
  await expect(page.locator('#collection-batch')).toHaveText('今回の追加：新規2件、重複1件');
  await expect(page.locator('#collection-ranges')).toHaveText('取得範囲：1〜4');
  await expect(page.locator('#collection-missing')).toHaveText('取得した範囲内に欠番はありません。');
  await expect(page.locator('#collection-gaps')).toBeEmpty();
  await expect(page.locator('#warnings li')).toHaveCount(1);
  const markdown = await page.locator('#output').inputValue();
  expect(markdown.match(/^## User$/gm)).toHaveLength(4);
  expect(markdown.indexOf('最初の質問')).toBeLessThan(markdown.indexOf('本文2'));
  expect(markdown.indexOf('本文3')).toBeLessThan(markdown.indexOf('最後の質問'));
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { window.copied = text; } } });
  });
  await page.locator('#copy').click();
  expect(await page.evaluate(() => window.copied)).toBe(markdown);
});

test('failed pastes and conflicts preserve the collection; reset starts a different conversation', async ({ page }) => {
  await collect(page);
  await paste(page, { 'text/plain': collectionTurn(1) });
  const markdown = await page.locator('#output').inputValue();
  await paste(page, { 'text/html': '<p>wrong MIME</p>' });
  await expect(page.locator('#input-error')).not.toBeEmpty();
  await expect(page.locator('#output')).toHaveValue(markdown);
  for (const html of ['<p>番号なし</p>', collectionTurn(2) + collectionTurn(1, '変更された本文'), collectionTurn(1, '別の会話', 'different')]) {
    await paste(page, { 'text/plain': html });
    await expect(page.locator('#conversion-error')).not.toBeEmpty();
    await expect(page.locator('#collection-batch')).toContainText('今回の入力は追加していません');
    await expect(page.locator('#collection-count')).toHaveText('取得済み：1件');
    await expect(page.locator('#output')).toHaveValue(markdown);
    await expect(page.locator('#copy')).toBeEnabled();
  }
  await page.locator('#reset-collection').click();
  await expect(page.locator('#input')).toHaveValue('');
  await expect(page.locator('#output')).toHaveValue('');
  await expect(page.locator('#conversion-error')).toBeEmpty();
  await expect(page.locator('#collection-count')).toHaveText('取得済み：0件');
  await expect(page.locator('#copy')).toBeDisabled();
  await paste(page, { 'text/plain': collectionTurn(1, '別の会話', 'different') });
  expect(await page.locator('#output').inputValue()).toContain('別の会話');
});

test('manual additions, input method changes and workflow switches preserve collection state', async ({ page }) => {
  await page.locator('#mode').selectOption('generic-html');
  await collect(page);
  await page.locator('#input').fill(collectionTurn(5));
  await expect(page.locator('#collection-count')).toHaveText('取得済み：0件');
  await page.locator('#convert').click();
  await expect(page.locator('#collection-start')).toContainText('先頭が含まれていない');
  const markdown = await page.locator('#output').inputValue();
  await page.locator('#input').fill('編集中');
  await expect(page.locator('#output')).toHaveValue(markdown);
  await page.locator('#input-method').selectOption('rich');
  await expect(page.locator('#output')).toHaveValue(markdown);
  await paste(page, { 'text/html': collectionTurn(5) + collectionTurn(6) });
  await expect(page.locator('#collection-batch')).toHaveText('今回の追加：新規1件、重複1件');
  const accumulated = await page.locator('#output').inputValue();
  await page.locator('#workflow').selectOption('single');
  await expect(page.locator('#collection')).toBeHidden();
  await expect(page.locator('#mode')).toBeEnabled();
  await expect(page.locator('#mode')).toHaveValue('generic-html');
  await paste(page, { 'text/html': '<p>単発変換</p>' });
  await page.locator('#convert').click();
  await expect(page.locator('#output')).toHaveValue('単発変換\n');
  await page.locator('#workflow').selectOption('collect');
  await expect(page.locator('#collection-count')).toHaveText('取得済み：2件');
  await expect(page.locator('#output')).toHaveValue(accumulated);
});

test('collection and gap previews do not execute HTML or fetch resources', async ({ page }) => {
  await collect(page);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await paste(page, { 'text/plain': collectionTurn(1, hostile) + collectionTurn(3, '&lt;img src=x onerror=alert(1)&gt;') });
  await expect(page.locator('#collection-count')).toHaveText('取得済み：2件');
  await expect(page.locator('#collection-gaps')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#collection img, #collection script')).toHaveCount(0);
  expect(await page.evaluate(() => window.inputExecuted)).toBeUndefined();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
});

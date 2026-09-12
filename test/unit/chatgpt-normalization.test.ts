import type { ConvertResult } from '../../src/core/document-model.ts';
import { success, conversation } from '../assertions.ts';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { convert } from '../../src/core/convert.ts';
import { fragmentRoot } from '../../src/core/dom.ts';

const captured = readFileSync(new URL('../fixtures/chatgpt/code-viewer-2026-09/input.html', import.meta.url), 'utf8');
const message = (html: string, role = 'assistant') => `<div data-message-author-role="${role}">${html}</div>`;
const firstCode = (result: ConvertResult) => fragmentRoot(conversation(result).items[0].html).querySelector('pre code')!;

describe('captured ChatGPT code viewer', () => {
  it('normalizes to semantic pre/code and preserves code text exactly', () => {
    const result = convert(captured);
    const root = fragmentRoot(conversation(result).items[0].html);
    expect(root.querySelector('[id="code-block-viewer"]')).toBeNull();
    expect(root.querySelector('pre pre')).toBeNull();
    expect([...root.querySelectorAll('pre')].map(pre => pre.textContent)).toEqual([
      'ipconfig /all', 'Write-Output "<ready>"\n  # sample', 'first\n\n  second\n```',
    ]);
  });

  it.each(['code', 'inner-pre', 'outer-pre'])('prefers the existing %s language over a UI label', position => {
    const root = fragmentRoot(captured);
    const wrapper = root.querySelector('pre')!;
    const target = position === 'code' ? wrapper.querySelector('code')! : position === 'inner-pre' ? wrapper.querySelector('pre.cm-content')! : wrapper;
    target.classList.add('language-custom');
    expect(firstCode(convert(root.innerHTML)).classList.contains('language-custom')).toBe(true);
  });

  it('drops an unsupported UI label without treating it as code or a language', () => {
    const root = fragmentRoot(captured);
    root.querySelector('pre .select-none.sticky .font-medium')!.textContent = 'Copy code `';
    const result = convert(root.innerHTML);
    expect(firstCode(result).className).not.toContain('language-');
    expect(firstCode(result).textContent).toBe('ipconfig /all');
  });

  it('retains unknown and ambiguous pre structures', () => {
    const unknown = '<pre>label<div>important</div><code>body</code></pre>';
    expect(success(convert(message(unknown))).markdown).toContain('```\nlabelimportantbody\n```');
    const root = fragmentRoot(captured);
    const wrapper = root.querySelector('pre')!;
    wrapper.append(wrapper.querySelector('[id="code-block-viewer"]')!.cloneNode(true));
    const result = convert(root.innerHTML);
    expect(success(result).markdown).toContain('cmdipconfig /allipconfig /all');
  });

  it('does not apply service normalization in Generic HTML mode', () => {
    expect(success(convert(captured, { mode: 'generic-html' })).markdown).toContain('```\ncmdipconfig /all\n```');
  });
});

describe('user line breaks and citation UI', () => {
  it('preserves newlines through inline markup without interpreting text as Markdown', () => {
    const result = convert(message('<div class="whitespace-pre-wrap"># title\n<strong>bold\nnext</strong><code>a\nb</code><pre>one\n  two</pre></div>', 'user'));
    const root = fragmentRoot(conversation(result).items[0].html);
    expect(root.querySelectorAll('br')).toHaveLength(2);
    expect(root.querySelector('strong')!.innerHTML).toBe('bold<br>next');
    expect(root.querySelector('code')!.textContent).toBe('a\nb');
    expect(root.querySelector('pre')!.textContent).toBe('one\n  two');
    expect(success(result).markdown).toContain('\\# title  \n');
  });

  it.each([
    ['<div class="whitespace-pre-wrap">one\ntwo</div>', 'assistant', 'auto'],
    ['<div>one\ntwo</div>', 'user', 'auto'],
    ['<div class="whitespace-pre-wrap">one\ntwo</div>', 'user', 'generic-html'],
  ])('limits newline preservation to the captured user content marker', (html, role, mode) => {
    expect(success(convert(message(html, role), { mode })).markdown).toContain('one two\n');
  });

  it('retains images outside citation UI and images with meaningful alt text', () => {
    const result = convert(message('<p><span data-testid="webpage-citation-pill"><a href="https://example.com"><img src="/favicon" alt=""><img src="https://example.com/source.png" alt="Source"></a></span></p><img src="https://example.com/body.png" alt="">'));
    expect(result.warnings.map(w => w.code)).toEqual(['COMPLETENESS_UNVERIFIED']);
    expect(success(result).markdown).toContain('[![Source](<https://example.com/source.png>)](<https://example.com>)');
    expect(success(result).markdown).toContain('![](<https://example.com/body.png>)');
  });
});

describe('ChatGPT search labels and literal strong text', () => {
  const pill = '<span data-inline-selection-pill data-id="search" data-keyword="ウェブ検索"><span>@ウェブ検索</span></span>';

  it('converts the known user search pill while retaining ordinary mentions and unknown pills', () => {
    const result = convert(message(`${pill} @ウェブ検索 <span data-inline-selection-pill data-id="other" data-keyword="other">@other</span>`, 'user'));
    expect(success(result).markdown).toContain('〔ウェブ検索〕 @ウェブ検索 @other\n');
  });

  it.each(['assistant', 'unknown'])('does not reinterpret search mentions in %s content', role => {
    const html = `<section data-testid="conversation-turn-0" data-turn="${role}">${pill}</section>`;
    expect(success(convert(html)).markdown).toContain('@ウェブ検索\n');
  });

  it('keeps search pills inside user code and in Generic HTML mode', () => {
    expect(success(convert(message(`<code>${pill}</code>`, 'user'))).markdown).toContain('`@ウェブ検索`');
    expect(success(convert(message(pill, 'user'), { mode: 'generic-html' })).markdown).toBe('@ウェブ検索\n');
  });

  it('turns paired assistant text into semantic strong, including decoded entities', () => {
    const result = convert(message('<p>**探索**では、**R&amp;D &lt; 100**。<em>**重要**</em></p>'));
    const root = fragmentRoot(conversation(result).items[0].html);
    expect([...root.querySelectorAll('strong')].map(node => node.textContent)).toEqual(['探索', 'R&D < 100', '重要']);
    expect(success(result).markdown).toContain('**探索**では、**R&D < 100**。***重要***\n');
  });

  it('leaves code and existing strong elements intact', () => {
    const result = convert(message('<p><code>**inline**</code><strong>**literal**</strong></p><pre><code>**fenced**\n  **next**</code></pre>'));
    const root = fragmentRoot(conversation(result).items[0].html);
    expect(root.querySelector('code')!.textContent).toBe('**inline**');
    expect(root.querySelector('pre')!.textContent).toBe('**fenced**\n  **next**');
    expect(root.querySelector('strong')!.textContent).toBe('**literal**');
    expect(root.querySelector('strong strong')).toBeNull();
    expect(success(result).markdown).toContain('`**inline**`');
    expect(success(result).markdown).toContain('```\n**fenced**\n  **next**\n```');
  });

  it('does not pair an invalid opening with a later valid strong phrase', () => {
    const result = convert(message('**trailing ** then **valid**'));
    expect([...fragmentRoot(conversation(result).items[0].html).querySelectorAll('strong')].map(node => node.textContent)).toEqual(['valid']);
  });

  it.each(['**open', '** spaced **', '****', '***triple***', String.raw`\**escaped**`, '**first\nsecond**', '**<em>cross</em>**'])('preserves unsupported or incomplete delimiters: %s', html => {
    const result = convert(message(`<p>${html}</p>`));
    expect(fragmentRoot(conversation(result).items[0].html).querySelector('strong')).toBeNull();
  });

  it('does not interpret literal strong in user, unknown or Generic HTML content', () => {
    const user = convert(message('<p>**literal**</p>', 'user'));
    const unknown = convert('<section data-testid="conversation-turn-0"><p>**literal**</p></section>');
    const generic = convert(message('<p>**literal**</p>'), { mode: 'generic-html' });
    for (const result of [user, unknown, generic]) expect(success(result).markdown).toContain('\\*\\*literal\\*\\*\n');
  });
});

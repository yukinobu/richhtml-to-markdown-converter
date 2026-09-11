import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { convert } from '../../src/core/convert.js';
import { fragmentRoot } from '../../src/core/dom.js';

const captured = readFileSync(new URL('../fixtures/chatgpt/code-viewer-2026-09/input.html', import.meta.url), 'utf8');
const message = (html, role = 'assistant') => `<div data-message-author-role="${role}">${html}</div>`;
const firstCode = result => fragmentRoot(result.document.items[0].html).querySelector('pre code');

describe('captured ChatGPT code viewer', () => {
  it('normalizes to semantic pre/code and preserves code text exactly', () => {
    const result = convert(captured);
    const root = fragmentRoot(result.document.items[0].html);
    expect(root.querySelector('[id="code-block-viewer"]')).toBeNull();
    expect(root.querySelector('pre pre')).toBeNull();
    expect([...root.querySelectorAll('pre')].map(pre => pre.textContent)).toEqual([
      'ipconfig /all', 'Write-Output "<ready>"\n  # sample', 'first\n\n  second\n```',
    ]);
  });

  it.each(['code', 'inner-pre', 'outer-pre'])('prefers the existing %s language over a UI label', position => {
    const root = fragmentRoot(captured);
    const wrapper = root.querySelector('pre');
    const target = position === 'code' ? wrapper.querySelector('code') : position === 'inner-pre' ? wrapper.querySelector('pre.cm-content') : wrapper;
    target.classList.add('language-custom');
    expect(firstCode(convert(root.innerHTML)).classList.contains('language-custom')).toBe(true);
  });

  it('drops an unsupported UI label without treating it as code or a language', () => {
    const root = fragmentRoot(captured);
    root.querySelector('pre .select-none.sticky .font-medium').textContent = 'Copy code `';
    const result = convert(root.innerHTML);
    expect(firstCode(result).className).not.toContain('language-');
    expect(firstCode(result).textContent).toBe('ipconfig /all');
  });

  it('retains unknown and ambiguous pre structures', () => {
    const unknown = '<pre>label<div>important</div><code>body</code></pre>';
    expect(convert(message(unknown)).markdown).toContain('```\nlabelimportantbody\n```');
    const root = fragmentRoot(captured);
    const wrapper = root.querySelector('pre');
    wrapper.append(wrapper.querySelector('[id="code-block-viewer"]').cloneNode(true));
    const result = convert(root.innerHTML);
    expect(result.markdown).toContain('cmdipconfig /allipconfig /all');
  });

  it('does not apply service normalization in Generic HTML mode', () => {
    expect(convert(captured, { mode: 'generic-html' }).markdown).toContain('```\ncmdipconfig /all\n```');
  });
});

describe('user line breaks and citation UI', () => {
  it('preserves newlines through inline markup without interpreting text as Markdown', () => {
    const result = convert(message('<div class="whitespace-pre-wrap"># title\n<strong>bold\nnext</strong><code>a\nb</code><pre>one\n  two</pre></div>', 'user'));
    const root = fragmentRoot(result.document.items[0].html);
    expect(root.querySelectorAll('br')).toHaveLength(2);
    expect(root.querySelector('strong').innerHTML).toBe('bold<br>next');
    expect(root.querySelector('code').textContent).toBe('a\nb');
    expect(root.querySelector('pre').textContent).toBe('one\n  two');
    expect(result.markdown).toContain('\\# title\\\n');
  });

  it.each([
    ['<div class="whitespace-pre-wrap">one\ntwo</div>', 'assistant', 'auto'],
    ['<div>one\ntwo</div>', 'user', 'auto'],
    ['<div class="whitespace-pre-wrap">one\ntwo</div>', 'user', 'generic-html'],
  ])('limits newline preservation to the captured user content marker', (html, role, mode) => {
    expect(convert(message(html, role), { mode }).markdown).toContain('one two\n');
  });

  it('retains images outside citation UI and images with meaningful alt text', () => {
    const result = convert(message('<p><span data-testid="webpage-citation-pill"><a href="https://example.com"><img src="/favicon" alt=""><img src="https://example.com/source.png" alt="Source"></a></span></p><img src="https://example.com/body.png" alt="">'));
    expect(result.warnings.map(w => w.code)).toEqual(['COMPLETENESS_UNVERIFIED']);
    expect(result.markdown).toContain('[![Source](<https://example.com/source.png>)](<https://example.com>)');
    expect(result.markdown).toContain('![](<https://example.com/body.png>)');
  });
});

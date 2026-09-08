import { it, expect, describe } from 'vitest';
import { convert } from '../../src/core/convert.js';
import { allowedUrl } from '../../src/core/normalize.js';

describe('fixed Markdown output', () => {
  it.each([
    ['hello', 'hello\n'],
    ['<h1>Title</h1><h6>Last</h6><p>Hello<br>world</p><hr>', '# Title\n\n###### Last\n\nHello\\\nworld\n\n---\n'],
    ['<p>  a\n b\t c &amp; &lt;tag&gt; ! </p>', 'a b c \\& \\<tag\\> \\!\n'],
    ['<p><strong> bold </strong><em> italic </em><s>gone</s><b></b></p>', '**bold** *italic* ~~gone~~\n'],
    ['<code>a`b</code>', '``a`b``\n'],
    ['<code>`x`</code>', '`` `x` ``\n'],
    ['<code> x </code>', '`  x  `\n'],
    ['<code>   </code><p>text</p>', '`   `\n\ntext\n'],
    ['<pre class="language-txt"><code class="badlanguage-no language-js">a\r\n\n\n```\nx</code></pre>', '````js\na\n\n\n```\nx\n````\n'],
    ['<blockquote><p>one</p><p>two</p></blockquote>', '> one\n>\n> two\n'],
    ['<ol start="9"><li>one<ul><li>child</li></ul></li><li><p>two</p><p>paragraph</p></li></ol>', '9. one\n   - child\n10. two\n\n    paragraph\n'],
    ['<ol start="bad" reversed><li value="5">one</li><li>two</li></ol>', '1. one\n2. two\n'],
    ['<a href="https://example.com/a b?q=&lt;x&gt;">link!</a><img src="https://example.com/image" alt="a[b]">', '[link\\!](<https://example.com/a%20b?q=%3Cx%3E>)![a\\[b\\]](<https://example.com/image>)\n'],
    ['<a href="/relative">text</a><img src="data:bad" alt="alt">', 'textalt\n'],
    ['<table><tr><td>A</td><td>B</td></tr></table>', '|  |  |\n| --- | --- |\n| A | B |\n'],
    ['<table><caption>Caption</caption><tr><th>Name</th><th>Code</th></tr><tr><td>a|b<br>c</td><td><code>x|y</code></td></tr></table>', 'Caption\n\n| Name | Code |\n| --- | --- |\n| a\\|b c | `x\\|y` |\n'],
    ['<table><tr><td colspan="2">wide</td></tr><tr><td>A</td><td>B</td></tr></table>', 'wide\n\nA / B\n'],
    ['<table><caption>Nested</caption><tr><td>A<table><tr><td>B</td></tr></table>C</td></tr></table>', 'Nested\n\nA B C\n'],
    ['<custom><p>one</p><section>two</section></custom>', 'one\n\ntwo\n'],
  ])('%s', (html, expected) => {
    const result = convert(html, { mode: 'generic-html' });
    expect(result.ok).toBe(true);
    expect(result.markdown).toBe(expected);
  });

  it('escapes every ASCII punctuation character outside code', () => {
    const text = Array.from({ length: 94 }, (_, index) => String.fromCharCode(index + 33)).filter(char => !/[A-Za-z0-9]/.test(char)).join('');
    const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    expect(convert(html).markdown).toBe([...text].map(char => '\\' + char).join('') + '\n');
  });

  it('retains valid images even with no text and rejects empty content', () => {
    expect(convert('<img src="https://example.com/a">')).toMatchObject({ ok: true, markdown: '![](<https://example.com/a>)\n' });
    expect(convert('<img src="/relative">')).toMatchObject({ ok: false, error: { code: 'NO_CONTENT' }, warnings: [{ code: 'URL_DROPPED' }] });
    expect(convert('<pre> \n </pre><hr>')).toMatchObject({ ok: false, error: { code: 'NO_CONTENT' } });
  });

  it('deduplicates and orders URL, table and list diagnostics', () => {
    const result = convert('<a href="/a">a</a><img src="/b" alt="b"><table><tr><td><p>c</p></td></tr></table><ol reversed><li value="4">d</li></ol>');
    expect(result.warnings.map(w => w.code)).toEqual(['LIST_NUMBERING_NORMALIZED', 'TABLE_FLATTENED', 'URL_DROPPED']);
    expect(result.document.html).not.toMatch(/href|src|reversed|value/);
  });
});

describe('URL policy', () => {
  it.each(['/relative', '//example.com/a', 'data:image/png;base64,a', 'blob:https://example.com/a', 'javascript:alert(1)', 'https:example.com', 'https://', 'https://exa\nmple.com', 'https://exa\u007fmple.com', 'mailto:', 'tel: '])('rejects %s', url => {
    expect(allowedUrl(url)).toBeNull();
  });
  it.each(['https://example.com', 'HTTP://example.com/a', 'mailto:a@example.com', 'tel:+123', '#part', '#'])('allows %s', url => {
    expect(allowedUrl(' ' + url + ' ')).toBe(url);
  });
  it('decodes entities before URL validation', () => {
    expect(convert('<a href="java&#x73;cript:alert(1)">label</a><a href="https://exa&#10;mple.com">label</a>').warnings.map(w => w.code)).toEqual(['URL_DROPPED']);
    expect(allowedUrl('mailto:a@example.com', true)).toBeNull();
  });
});

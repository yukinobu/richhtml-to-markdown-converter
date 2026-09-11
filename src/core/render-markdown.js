import { fragmentRoot, tag, collapse, trimHtmlSpace, blockTags } from './dom.js';
import { tableRows, isComplexTable, flatCellText } from './normalize.js';

const inlineTags = new Set(['strong', 'b', 'em', 'i', 'del', 's', 'a', 'img', 'code', 'br']);
const tableTags = new Set(['caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td']);
// Keep prose punctuation readable, but protect literal inline Markdown, HTML,
// autolinks and character references. End-of-node guards also cover split text.
export const escapeText = text => text.replace(/[\\`*_[\]|~]/g, '\\$&')
  .replace(/<(?=\S|$)/g, '\\<')
  .replace(/&(?=(?:#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z\d]*);|$)/g, '\\&');
const escapeBlockStart = text => text
  .replace(/^( *)(#{1,6})(?= |$)/gm, '$1\\$2')
  .replace(/^( *)(>)/gm, '$1\\$2')
  .replace(/^( *)([-+])(?= |$)/gm, '$1\\$2')
  .replace(/^( *)(\d{1,9})([.)])(?= |$)/gm, '$1$2\\$3')
  .replace(/^( *)([-=])(?=[ -=]*$)/gm, '$1\\$2');
const longestTicks = text => Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length));
const encodeUrl = url => url.replace(/[ <>]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const joinInline = parts => parts.reduce((text, part) => {
  if (part.startsWith('  \n')) return text.replace(/ +$/, '') + part;
  if (part.startsWith('[')) text = text.replace(/(?<!\\)!$/, '\\!');
  return text + (/[ \n]$/.test(text) ? part.replace(/^ +/, '') : part);
}, '');

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
function sourceWidth(text) {
  // Measure Markdown source, including delimiters. CJK/fullwidth and emoji
  // occupy two columns; combining marks stay with their base character.
  let width = 0;
  for (const { segment } of graphemes.segment(text)) {
    if (/^[\p{Mark}\p{Format}]+$/u.test(segment)) continue;
    width += /[\p{Extended_Pictographic}\p{Regional_Indicator}\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\ua960-\ua97c\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{1b000}-\u{1b2ff}\u{20000}-\u{3fffd}\u20e3]/u.test(segment) ? 2 : 1;
  }
  return width;
}

function inlineCode(text) {
  text = text.replace(/\r\n?|\n/g, ' ');
  if (!text) return '';
  const delimiter = '`'.repeat(longestTicks(text) + 1);
  if (text.startsWith('`') || text.endsWith('`') || (/^ .* $/.test(text) && /[^ ]/.test(text))) text = ` ${text} `;
  return delimiter + text + delimiter;
}

function decoration(text, delimiter) {
  const inner = trimHtmlSpace(text);
  if (!inner) return text;
  const leading = text.match(/^[\t\n\f\r ]*/)[0];
  const trailing = text.match(/[\t\n\f\r ]*$/)[0];
  return `${leading}${delimiter}${inner}${delimiter}${trailing}`;
}

function inline(node, context) {
  if (node.nodeType === 3) return escapeText(collapse(node.textContent));
  if (node.nodeType !== 1) return '';
  const name = tag(node);
  if (name === 'br') return context.table ? ' ' : '  \n';
  if (name === 'code') return inlineCode(node.textContent);
  const children = () => joinInline([...node.childNodes].map(child => inline(child, context)));
  if (['strong', 'b'].includes(name)) return decoration(children(), '**');
  if (['em', 'i'].includes(name)) return decoration(children(), '*');
  if (['del', 's'].includes(name)) return decoration(children(), '~~');
  if (name === 'a' && node.hasAttribute('href')) return `[${children()}](<${encodeUrl(node.getAttribute('href'))}>)`;
  if (name === 'img') return `![${escapeText(collapse(node.getAttribute('alt') ?? ''))}](<${encodeUrl(node.getAttribute('src'))}>)`;
  return children();
}

function codeBlock(node) {
  const text = node.textContent.replace(/\r\n?/g, '\n');
  const fence = '`'.repeat(Math.max(3, longestTicks(text) + 1));
  const code = [...node.children].find(child => tag(child) === 'code');
  const classes = [code, node].flatMap(element => (element?.getAttribute('class') ?? '').split(/\s+/));
  const language = classes.map(token => /^language-([A-Za-z0-9_+-]+)$/.exec(token)).find(Boolean)?.[1] ?? '';
  return `${fence}${language}\n${text}${text.endsWith('\n') ? '' : '\n'}${fence}`;
}

function renderList(node, context) {
  const start = node.getAttribute('start')?.trim() ?? '1';
  let number = /^[+-]?\d+$/.test(start) && Number.isSafeInteger(Number(start)) ? Number(start) : 1;
  return [...node.children].filter(child => tag(child) === 'li').map(item => {
    const marker = tag(node) === 'ol' ? `${number++}. ` : '- ';
    const blocks = flowBlocks(item, context);
    // A child list directly following item text needs a line break, whereas
    // separate paragraphs keep their blank line.
    const text = blocks.map((block, index) => `${index ? (block.list ? '\n' : '\n\n') : ''}${block.text}`).join('');
    return marker + text.split('\n').map((line, index) => index && line ? ' '.repeat(marker.length) + line : line).join('\n');
  }).join('\n');
}

function renderTable(node, context) {
  const rows = tableRows(node);
  if (!rows.flat().length) return '';
  const caption = [...node.children].find(child => tag(child) === 'caption');
  if (isComplexTable(node)) {
    return [caption ? escapeBlockStart(escapeText(flatCellText(caption))) : '', ...rows.map(row => escapeBlockStart(row.map(cell => escapeText(flatCellText(cell))).join(' / ')))].filter(Boolean).join('\n\n');
  }
  const rendered = rows.map(row => row.map(cell => {
    const value = escapeBlockStart(trimHtmlSpace(joinInline([...cell.childNodes].map(child => inline(child, { ...context, table: true })))));
    // Text pipes have already been escaped; code and URL pipes have not.
    return value.replace(/(\\*)\|/g, (match, slashes) => slashes.length % 2 ? match : slashes + '\\|');
  }));
  const header = rows[0].every(cell => tag(cell) === 'th') ? rendered.shift() : rows[0].map(() => '');
  const widths = header.map((cell, index) => Math.max(3, sourceWidth(cell), ...rendered.map(row => sourceWidth(row[index]))));
  const format = row => `| ${row.map((cell, index) => cell + ' '.repeat(widths[index] - sourceWidth(cell))).join(' | ')} |`;
  const table = [format(header), format(widths.map(width => '-'.repeat(width))), ...rendered.map(format)].join('\n');
  const captionText = caption ? flow(caption, context) : '';
  return captionText ? `${captionText}\n\n${table}` : table;
}

function block(node, context) {
  const name = tag(node);
  if (name === 'pre') return codeBlock(node);
  if (name === 'hr') return '---';
  if (name === 'ul' || name === 'ol') return renderList(node, context);
  if (name === 'table') return renderTable(node, context);
  if (name === 'blockquote') return flow(node, context).split('\n').map(line => line ? `> ${line}` : '>').join('\n');
  if (/^h[1-6]$/.test(name)) {
    const text = flow(node, context).replace(/(?<= )#+$/, hashes => '\\' + hashes);
    return text ? `${'#'.repeat(Math.min(Number(name[1]) + context.headingOffset, 6))} ${text}` : '';
  }
  return flow(node, context);
}

function flowBlocks(root, context) {
  const blocks = [];
  let pending = '';
  const flush = () => {
    const text = escapeBlockStart(trimHtmlSpace(pending));
    if (text) blocks.push({ text, list: false });
    pending = '';
  };
  const visit = node => {
    if (node.nodeType === 1 && blockTags.has(tag(node))) {
      flush();
      const text = block(node, context);
      if (text) blocks.push({ text, list: ['ol', 'ul'].includes(tag(node)) });
    } else if (node.nodeType === 1 && !inlineTags.has(tag(node))) {
      // Unknown wrappers are transparent, including any block descendants.
      for (const child of node.childNodes) visit(child);
    } else pending = joinInline([pending, inline(node, context)]);
  };
  for (const node of root.childNodes) visit(node);
  flush();
  return blocks;
}

function flow(root, context) { return flowBlocks(root, context).map(block => block.text).join('\n\n'); }

export function renderMarkdown(document) {
  const render = (html, headingOffset) => {
    const root = fragmentRoot(html);
    // Transparent wrappers must not split a literal entity or punctuation run
    // into separately escaped fragments. Preserve semantic and code boundaries.
    for (const node of root.querySelectorAll('*')) {
      if (!blockTags.has(tag(node)) && !inlineTags.has(tag(node)) && !tableTags.has(tag(node)) && !node.closest('pre, code')) node.replaceWith(...node.childNodes);
    }
    // LinkeDOM emits separate text nodes for decoded character references.
    root.normalize();
    return flow(root, { headingOffset, table: false });
  };
  if (document.type === 'document') return render(document.html, 0) + '\n';
  const labels = { user: 'User', assistant: 'Assistant', unknown: 'Unknown' };
  const messages = document.items.map(item => `## ${labels[item.role]}\n\n${render(item.html, 2)}`);
  return `---\nsource: ${document.metadata.source}\ntype: conversation\n---\n\n${messages.join('\n\n')}\n`;
}

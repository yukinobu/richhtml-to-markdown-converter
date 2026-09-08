import { fragmentRoot, tag, collapse, trimHtmlSpace, blockTags } from './dom.js';
import { tableRows, isComplexTable, flatCellText } from './normalize.js';

export const escapeText = text => text.replace(/[!-/:-@\[-`{-~]/g, '\\$&');
const longestTicks = text => Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length));
const encodeUrl = url => url.replace(/[ <>]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const joinInline = parts => parts.reduce((text, part) => text + (text.endsWith(' ') ? part.replace(/^ +/, '') : part), '');

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
  if (name === 'br') return context.table ? ' ' : '\\\n';
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
    return [caption ? escapeText(flatCellText(caption)) : '', ...rows.map(row => row.map(cell => escapeText(flatCellText(cell))).join(' / '))].filter(Boolean).join('\n\n');
  }
  const format = row => `| ${row.join(' | ')} |`;
  const rendered = rows.map(row => row.map(cell => {
    const value = trimHtmlSpace(joinInline([...cell.childNodes].map(child => inline(child, { ...context, table: true }))));
    // Text pipes have already been escaped; code and URL pipes have not.
    return value.replace(/(\\*)\|/g, (match, slashes) => slashes.length % 2 ? match : slashes + '\\|');
  }));
  const header = rows[0].every(cell => tag(cell) === 'th') ? rendered.shift() : rows[0].map(() => '');
  const table = [format(header), format(header.map(() => '---')), ...rendered.map(format)].join('\n');
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
    const text = flow(node, context);
    return text ? `${'#'.repeat(Math.min(Number(name[1]) + context.headingOffset, 6))} ${text}` : '';
  }
  return flow(node, context);
}

function flowBlocks(root, context) {
  const blocks = [];
  let pending = '';
  const flush = () => {
    const text = trimHtmlSpace(pending);
    if (text) blocks.push({ text, list: false });
    pending = '';
  };
  const visit = node => {
    if (node.nodeType === 1 && blockTags.has(tag(node))) {
      flush();
      const text = block(node, context);
      if (text) blocks.push({ text, list: ['ol', 'ul'].includes(tag(node)) });
    } else if (node.nodeType === 1 && !['strong', 'b', 'em', 'i', 'del', 's', 'a', 'img', 'code', 'br'].includes(tag(node))) {
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
  const render = (html, headingOffset) => flow(fragmentRoot(html), { headingOffset, table: false });
  if (document.type === 'document') return render(document.html, 0) + '\n';
  const labels = { user: 'User', assistant: 'Assistant', unknown: 'Unknown' };
  const messages = document.items.map(item => `## ${labels[item.role]}\n\n${render(item.html, 2)}`);
  return `---\nsource: ${document.metadata.source}\ntype: conversation\n---\n\n${messages.join('\n\n')}\n`;
}

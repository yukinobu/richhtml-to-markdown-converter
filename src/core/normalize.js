import { fragmentRoot, sanitize, blockTags, collapse, tag } from './dom.js';
import { diagnostic } from './diagnostics.js';

export function allowedUrl(raw, image = false) {
  const url = raw.trim();
  if (/[\x00-\x1f\x7f]/.test(url)) return null;
  if (/^https?:\/\//i.test(url)) {
    try { if (new URL(url).hostname) return url; } catch { /* Invalid absolute URL. */ }
  }
  if (!image && (/^(mailto|tel):\S/i.test(url) || url.startsWith('#'))) return url;
  return null;
}

function visibleText(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.nodeType !== 1) return '';
  if (tag(node) === 'img') return node.getAttribute('alt') ?? '';
  if (tag(node) === 'br') return ' ';
  const text = [...node.childNodes].map(visibleText).join('');
  return blockTags.has(tag(node)) ? ` ${text} ` : text;
}

export function tableRows(table) {
  return [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table)
    .map(row => [...row.children].filter(cell => ['th', 'td'].includes(tag(cell))));
}

export function isComplexTable(rows) {
  return rows.some(row => row.length !== rows[0].length)
    || rows.flat().some(cell => ['rowspan', 'colspan'].some(attr => cell.hasAttribute(attr) && Number(cell.getAttribute(attr)) !== 1)
      || [...cell.querySelectorAll('*')].some(node => blockTags.has(tag(node))));
}

export const flatCellText = cell => collapse(visibleText(cell)).trim();

export function normalize(html, itemIndex, warnings) {
  const root = sanitize(fragmentRoot(html));
  const warn = code => warnings.push(diagnostic(code, itemIndex));
  for (const node of root.querySelectorAll('a[href], img')) {
    const image = tag(node) === 'img';
    const attribute = image ? 'src' : 'href';
    const url = allowedUrl(node.getAttribute(attribute) ?? '', image);
    if (url !== null) node.setAttribute(attribute, url);
    else {
      warn('URL_DROPPED');
      if (image) node.replaceWith(root.ownerDocument.createTextNode(node.getAttribute('alt') ?? ''));
      else node.removeAttribute('href');
    }
  }
  for (const node of root.querySelectorAll('ol[reversed], li[value]')) {
    warn('LIST_NUMBERING_NORMALIZED');
    node.removeAttribute(tag(node) === 'ol' ? 'reversed' : 'value');
  }
  // Only process outer tables: flattened nested content must appear once.
  for (const table of [...root.querySelectorAll('table')].filter(table => !table.parentElement.closest('table'))) {
    const rows = tableRows(table);
    const cells = rows.flat();
    if (!cells.length) { table.remove(); continue; }
    if (isComplexTable(rows)) warn('TABLE_FLATTENED');
  }
  return {
    html: root.innerHTML,
    hasContent: Boolean(root.textContent.trim() || root.querySelector('img[src]')),
  };
}

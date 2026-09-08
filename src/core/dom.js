import { parse, parseFragment, serialize } from 'parse5';
import { DOMParser } from 'linkedom/worker';

// Both parsers are JavaScript data structures: no native browser DOM, loaders,
// custom elements or script execution are involved, including before sanitizing.
export function parseDocument(html) {
  return new DOMParser().parseFromString(serialize(parse(html)), 'text/html');
}

export function fragmentRoot(html) {
  const document = new DOMParser().parseFromString('<html><head></head><body></body></html>', 'text/html');
  document.body.innerHTML = serialize(parseFragment(html));
  return document.body;
}

export function allIncludingRoot(root, selector) {
  if (selector === ':scope') return [root];
  const matches = [...root.querySelectorAll(selector)];
  if (root.matches?.(selector)) matches.unshift(root);
  return [...new Set(matches)];
}

export function outermost(nodes) {
  const selected = new Set(nodes);
  return nodes.filter(node => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (selected.has(parent)) return false;
    }
    return true;
  });
}

export function selectFirst(root, selectors) {
  for (const selector of selectors) {
    const nodes = outermost(allIncludingRoot(root, selector));
    if (nodes.length) return { nodes, selector };
  }
  return { nodes: [], selector: null };
}

const forbidden = 'script, style, link, base, meta, iframe, object, embed, template, svg, [hidden], [aria-hidden="true"]';

export function sanitize(root) {
  for (const node of allIncludingRoot(root, forbidden)) {
    if (node === root) {
      root.replaceChildren();
      for (const attribute of [...root.attributes]) root.removeAttribute(attribute.name);
    } else node.remove();
  }
  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || attribute.name === 'style') node.removeAttribute(attribute.name);
    }
  }
  return root;
}

export const tag = node => node.localName;
export const collapse = text => text.replace(/[\t\n\f\r ]+/g, ' ');
export const trimHtmlSpace = text => text.replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
export const blockTags = new Set(['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'hr', 'dl', 'dt', 'dd', 'figure', 'figcaption', 'address']);

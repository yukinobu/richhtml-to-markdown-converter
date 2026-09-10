import { allIncludingRoot, fragmentRoot, outermost } from '../core/dom.js';
import { diagnostic } from '../core/diagnostics.js';

export function chatgptResolveRole(item, mappedRole, itemIndex) {
  const valid = value => value === 'user' || value === 'assistant';
  const turn = item.getAttribute('data-turn');
  const authors = new Set(allIncludingRoot(item, '[data-message-author-role]')
    .map(node => node.getAttribute('data-message-author-role')).filter(valid));
  const role = valid(turn) ? turn : authors.size === 1 ? [...authors][0] : 'unknown';
  const warnings = [];
  if (valid(turn) && [...authors].some(author => author !== turn)) warnings.push(diagnostic('ROLE_CONFLICT', itemIndex));
  if (role === 'unknown') warnings.push(diagnostic('UNKNOWN_ROLE', itemIndex));
  return { role, warnings };
}

function normalizeCodeViewers(root) {
  // The September 2026 DOM nests the actual code inside a UI <pre> wrapper.
  // Only recognize this captured structure; arbitrary <pre> text stays intact.
  for (const wrapper of outermost([...root.querySelectorAll('pre')])) {
    const viewers = wrapper.querySelectorAll('[id="code-block-viewer"]');
    if (viewers.length !== 1) continue;
    const candidates = viewers[0].querySelectorAll('pre.cm-content');
    if (candidates.length !== 1) continue;
    const actual = candidates[0];
    const codes = [...actual.children].filter(node => node.localName === 'code');
    if (codes.length !== 1) continue;

    const pre = actual.cloneNode(true);
    const code = pre.querySelector('code');
    const existingLanguage = [codes[0], actual, wrapper]
      .flatMap(node => [...node.classList])
      .find(token => /^language-[A-Za-z0-9_+-]+$/.test(token));
    const label = wrapper.querySelector('.select-none.sticky .font-medium')?.textContent.trim();
    const languageClass = existingLanguage ?? (label && /^[A-Za-z0-9_+-]+$/.test(label) ? `language-${label.toLowerCase()}` : null);
    if (languageClass) code.classList.add(languageClass);
    wrapper.replaceWith(pre);
  }
}

function preserveUserLineBreaks(root) {
  const visit = node => {
    // Inline code and fenced code retain their own whitespace rules.
    if (node.nodeType === 1 && ['pre', 'code'].includes(node.localName)) return;
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== 3) { visit(child); continue; }
      const lines = child.textContent.replace(/\r\n?/g, '\n').split('\n');
      if (lines.length === 1) continue;
      const nodes = lines.flatMap((line, index) => [
        ...(index ? [root.ownerDocument.createElement('br')] : []),
        root.ownerDocument.createTextNode(line),
      ]);
      child.replaceWith(...nodes);
    }
  };
  for (const node of outermost([...root.querySelectorAll('.whitespace-pre-wrap')])) {
    if (!node.closest('pre, code')) visit(node);
  }
}

function normalizeSearchPills(root) {
  for (const pill of root.querySelectorAll('[data-inline-selection-pill][data-id="search"][data-keyword]')) {
    if (pill.closest('pre, code')) continue;
    const label = pill.getAttribute('data-keyword').trim();
    if (label) pill.replaceWith(root.ownerDocument.createTextNode(`〔${label}〕`));
  }
}

function normalizeLiteralStrong(root) {
  root.normalize();
  const visit = node => {
    if (node.nodeType === 1 && ['pre', 'code', 'strong', 'b'].includes(node.localName)) return;
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== 3) { visit(child); continue; }
      // Only paired, nonempty ** delimiters in one text node. Do not infer
      // other Markdown, cross element boundaries, or reinterpret escaped runs.
      const text = child.textContent;
      const matches = [...text.matchAll(/(?<![\\*])\*\*(?![\s*])((?:(?!\*\*)[^\r\n])*?\S)(?<![\\*])\*\*(?!\*)/g)];
      if (!matches.length) continue;
      const nodes = [];
      let end = 0;
      for (const match of matches) {
        nodes.push(root.ownerDocument.createTextNode(text.slice(end, match.index)));
        const strong = root.ownerDocument.createElement('strong');
        strong.textContent = match[1];
        nodes.push(strong);
        end = match.index + match[0].length;
      }
      nodes.push(root.ownerDocument.createTextNode(text.slice(end)));
      child.replaceWith(...nodes);
    }
  };
  visit(root);
}

export function chatgptNormalizeContent(html, { role } = {}) {
  const root = fragmentRoot(html);
  normalizeCodeViewers(root);
  if (role === 'user') {
    normalizeSearchPills(root);
    preserveUserLineBreaks(root);
  }
  if (role === 'assistant') normalizeLiteralStrong(root);
  return { html: root.innerHTML, warnings: [] };
}

export function chatgptInspectDocument(document, items) {
  const warnings = [diagnostic('COMPLETENESS_UNVERIFIED')];
  const numbers = items.map(item => {
    const match = /^conversation-turn-(0|[1-9][0-9]*)$/.exec(item.getAttribute('data-testid') ?? '');
    return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
  });
  if (numbers.some(number => number === null)) return { warnings };
  if (numbers.every(number => number > 1)) warnings.push(diagnostic('POSSIBLE_MISSING_START'));
  if (numbers.some((number, index) => index > 0 && number <= numbers[index - 1])) {
    warnings.push(diagnostic('TURN_SEQUENCE_INVALID'));
  } else if (numbers.some((number, index) => index > 0 && number - numbers[index - 1] > 1)) {
    warnings.push(diagnostic('MISSING_TURNS'));
  }
  return { warnings };
}

export const hookRegistry = { chatgptResolveRole, chatgptNormalizeContent, chatgptInspectDocument };

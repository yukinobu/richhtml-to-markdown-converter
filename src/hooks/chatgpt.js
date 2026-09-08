import { allIncludingRoot } from '../core/dom.js';
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

export function chatgptNormalizeContent(html) { return { html, warnings: [] }; }

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

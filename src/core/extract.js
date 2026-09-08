import { allIncludingRoot, selectFirst } from './dom.js';
import { diagnostic, ConversionError } from './diagnostics.js';
import { normalize, hasContent } from './normalize.js';
import { conversation, document } from './document-model.js';

function selectedHtml(nodes, exclusions) {
  return nodes.map(node => {
    const clone = node.cloneNode(true);
    for (const selectors of exclusions) {
      for (const selector of selectors ?? []) {
        for (const excluded of allIncludingRoot(clone, selector)) {
          if (excluded === clone) return '';
          excluded.remove();
        }
      }
    }
    return clone.outerHTML;
  }).join('\n');
}

export function extract(root, profile, registry, warnings) {
  const hooks = Object.fromEntries(Object.entries(profile.hooks ?? {}).map(([key, name]) => [key, registry[name]]));
  const content = (selection, context = {}) => {
    let html = selectedHtml(selection.nodes, [profile.exclude, profile.items?.exclude]);
    if (hooks.normalizeContent) {
      const result = hooks.normalizeContent(html, context);
      html = result.html;
      warnings.push(...result.warnings);
    }
    return normalize(html, context.itemIndex, warnings);
  };
  if (profile.documentType === 'document') {
    const html = content(selectFirst(root, profile.content.selectors));
    if (!hasContent(html)) throw new ConversionError('NO_CONTENT');
    return document(html, profile.id);
  }
  const { nodes } = selectFirst(root, profile.items.selectors);
  if (!nodes.length) throw new ConversionError('NO_ITEMS');
  if (hooks.inspectDocument) warnings.push(...hooks.inspectDocument(root, nodes).warnings);
  const items = [];
  nodes.forEach((item, itemIndex) => {
    const mapping = profile.items.role;
    const value = mapping?.attribute ? item.getAttribute(mapping.attribute) : null;
    let role = mapping?.map && Object.hasOwn(mapping.map, value) ? mapping.map[value] : 'unknown';
    if (hooks.resolveRole) {
      const result = hooks.resolveRole(item, role, itemIndex);
      role = result.role;
      warnings.push(...result.warnings);
    }
    const selection = selectFirst(item, profile.items.content.selectors[role]);
    if (selection.selector === ':scope') warnings.push(diagnostic('CONTENT_FALLBACK', itemIndex));
    const html = content(selection, { role, itemIndex });
    if (!hasContent(html)) warnings.push(diagnostic('EMPTY_MESSAGE', itemIndex));
    else items.push({ type: 'message', role, html });
  });
  if (!items.length) throw new ConversionError('NO_CONTENT');
  // The initial conversation profile's metadata contract uses its source name.
  const source = profile.id.replace(/-conversation$/, '');
  return conversation(items, source);
}

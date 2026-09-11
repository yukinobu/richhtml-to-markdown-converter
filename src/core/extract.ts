import { allIncludingRoot, selectFirst } from './dom.ts';
import { diagnostic, ConversionError } from './diagnostics.ts';
import { normalize } from './normalize.ts';
import { conversation, document } from './document-model.ts';
import type { Diagnostic, Message, SemanticDocument } from './document-model.ts';
import type { ContentContext, HookRegistry, Profile } from './profile.ts';

function selectedHtml(nodes: Element[], exclusions: (string[] | undefined)[]) {
  return nodes.map(node => {
    const clone = node.cloneNode(true) as Element;
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

export function extract(root: Element, profile: Profile, registry: HookRegistry, warnings: Diagnostic[]): SemanticDocument {
  const hooks = {
    resolveRole: profile.hooks?.resolveRole === undefined ? undefined : registry.resolveRole?.[profile.hooks.resolveRole],
    normalizeContent: profile.hooks?.normalizeContent === undefined ? undefined : registry.normalizeContent?.[profile.hooks.normalizeContent],
    inspectDocument: profile.hooks?.inspectDocument === undefined ? undefined : registry.inspectDocument?.[profile.hooks.inspectDocument],
  };
  const content = (selection: ReturnType<typeof selectFirst>, context: ContentContext = {}) => {
    let html = selectedHtml(selection.nodes, [profile.exclude, profile.items?.exclude]);
    if (hooks.normalizeContent) {
      const result = hooks.normalizeContent(html, context);
      html = result.html;
      warnings.push(...result.warnings);
    }
    return normalize(html, context.itemIndex, warnings);
  };
  if (profile.documentType === 'document') {
    const { html, hasContent } = content(selectFirst(root, profile.content.selectors));
    if (!hasContent) throw new ConversionError('NO_CONTENT');
    return document(html, profile.id);
  }
  const { nodes } = selectFirst(root, profile.items.selectors);
  if (!nodes.length) throw new ConversionError('NO_ITEMS');
  if (hooks.inspectDocument) warnings.push(...hooks.inspectDocument(root, nodes).warnings);
  const items: Message[] = [];
  nodes.forEach((item, itemIndex) => {
    const mapping = profile.items.role;
    const value = mapping?.attribute ? item.getAttribute(mapping.attribute) : null;
    let role = mapping?.map && value !== null && Object.hasOwn(mapping.map, value) ? mapping.map[value] : 'unknown';
    if (hooks.resolveRole) {
      const result = hooks.resolveRole(item, role, itemIndex);
      role = result.role;
      warnings.push(...result.warnings);
    }
    const selection = selectFirst(item, profile.items.content.selectors[role]);
    if (selection.selector === ':scope') warnings.push(diagnostic('CONTENT_FALLBACK', itemIndex));
    const { html, hasContent } = content(selection, { role, itemIndex });
    if (!hasContent) warnings.push(diagnostic('EMPTY_MESSAGE', itemIndex));
    else items.push({ type: 'message', role, html });
  });
  if (!items.length) throw new ConversionError('NO_CONTENT');
  // The initial conversation profile's metadata contract uses its source name.
  const source = profile.id.replace(/-conversation$/, '');
  return conversation(items, source);
}

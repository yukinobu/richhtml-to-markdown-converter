import { fragmentRoot } from './dom.js';
import { ConversionError } from './diagnostics.js';

const roles = ['user', 'assistant', 'unknown'];
const fail = () => { throw new ConversionError('INVALID_PROFILE'); };
function fields(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  if (Object.keys(value).some(key => !allowed.includes(key))) fail();
  if (required.some(key => !Object.hasOwn(value, key))) fail();
}
function selectors(value, root, nonempty = true) {
  if (!Array.isArray(value) || (nonempty && !value.length)) fail();
  for (const selector of value) {
    if (typeof selector !== 'string' || !selector.trim()) fail();
    try { root.querySelectorAll(selector); root.matches(selector); } catch { fail(); }
  }
}

export function validateProfiles(profiles, registry) {
  if (!Array.isArray(profiles) || !profiles.length) fail();
  const ids = new Set();
  const root = fragmentRoot('<div></div>');
  for (const profile of profiles) {
    fields(profile, ['id', 'name', 'documentType', 'detect', 'items', 'content', 'exclude', 'hooks'], ['id', 'name', 'documentType']);
    if (typeof profile.id !== 'string' || !profile.id.trim() || typeof profile.name !== 'string' || !profile.name.trim() || ids.has(profile.id)) fail();
    ids.add(profile.id);
    if (!['conversation', 'document'].includes(profile.documentType)) fail();
    if (profile.detect !== undefined) {
      fields(profile.detect, ['all', 'any']);
      if (Object.keys(profile.detect).length !== 1) fail();
      selectors(profile.detect.all ?? profile.detect.any, root);
    }
    if (profile.exclude !== undefined) selectors(profile.exclude, root, false);
    if (profile.hooks !== undefined) {
      fields(profile.hooks, ['resolveRole', 'normalizeContent', 'inspectDocument']);
      for (const hook of Object.values(profile.hooks)) {
        if (typeof hook !== 'string' || !Object.hasOwn(registry, hook) || typeof registry[hook] !== 'function') fail();
      }
    }
    if (profile.documentType === 'document') {
      if (profile.items !== undefined) fail();
      fields(profile.content, ['selectors'], ['selectors']);
      selectors(profile.content.selectors, root);
    } else {
      if (profile.content !== undefined) fail();
      const item = profile.items;
      fields(item, ['selectors', 'type', 'role', 'content', 'exclude'], ['selectors', 'type', 'content']);
      if (item.type !== 'message') fail();
      selectors(item.selectors, root);
      fields(item.content, ['selectors'], ['selectors']);
      fields(item.content.selectors, roles, roles);
      for (const value of Object.values(item.content.selectors)) selectors(value, root);
      if (item.exclude !== undefined) selectors(item.exclude, root, false);
      if (item.role !== undefined) {
        fields(item.role, ['attribute', 'map']);
        if (item.role.attribute !== undefined && (typeof item.role.attribute !== 'string' || !item.role.attribute.trim())) fail();
        if (item.role.map !== undefined) {
          if (!item.role.map || typeof item.role.map !== 'object' || Array.isArray(item.role.map)) fail();
          if (Object.values(item.role.map).some(role => !roles.includes(role))) fail();
        }
      }
    }
  }
}

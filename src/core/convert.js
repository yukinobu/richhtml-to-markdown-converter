import { profiles as builtins } from '../profiles/index.js';
import { hookRegistry } from '../hooks/chatgpt.js';
import { parseDocument, sanitize } from './dom.js';
import { validateProfiles } from './profile-schema.js';
import { detectSource } from './detect-source.js';
import { extract } from './extract.js';
import { renderMarkdown } from './render-markdown.js';
import { diagnostic, ConversionError, sortWarnings } from './diagnostics.js';

export function createConverter(profiles, registry = {}) {
  return function convert(html, { mode = 'auto' } = {}) {
    let profileId = null;
    const warnings = [];
    try {
      if (mode !== 'auto' && !profiles.some(profile => profile.id === mode)) throw new ConversionError('INVALID_MODE');
      if (typeof html !== 'string') throw new ConversionError('CONVERSION_FAILED');
      if (!html.trim()) throw new ConversionError('EMPTY_INPUT');
      validateProfiles(profiles, registry);
      const root = sanitize(parseDocument(html).body);
      const profile = mode === 'auto' ? detectSource(root, profiles) : profiles.find(profile => profile.id === mode);
      if (!profile) throw new ConversionError('INVALID_PROFILE');
      profileId = profile.id;
      const document = extract(root, profile, registry, warnings);
      return { ok: true, profileId, document, markdown: renderMarkdown(document), warnings: sortWarnings(warnings) };
    } catch (error) {
      return { ok: false, profileId, error: diagnostic(error instanceof ConversionError ? error.code : 'CONVERSION_FAILED'), warnings: sortWarnings(warnings) };
    }
  };
}

export const convert = createConverter(builtins, hookRegistry);

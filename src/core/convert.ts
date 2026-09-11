import { profiles as builtins } from '../profiles/index.ts';
import { hookRegistry } from '../hooks/chatgpt.ts';
import { parseDocument, sanitize } from './dom.ts';
import { validateProfiles } from './profile-schema.ts';
import { detectSource } from './detect-source.ts';
import { extract } from './extract.ts';
import { renderMarkdown } from './render-markdown.ts';
import { diagnostic, ConversionError, sortWarnings } from './diagnostics.ts';
import type { ConvertResult, Diagnostic } from './document-model.ts';
import type { HookRegistry, Profile } from './profile.ts';

export function createConverter(profiles: Profile[], registry: HookRegistry = {}) {
  return function convert(html: string, { mode = 'auto' }: { mode?: string } = {}): ConvertResult {
    let profileId: string | null = null;
    const warnings: Diagnostic[] = [];
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

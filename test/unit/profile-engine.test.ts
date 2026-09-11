import { success, conversation } from '../assertions.ts';
import assert from 'node:assert/strict';
import { describe, it, expect } from 'vitest';
import { convert, createConverter } from '../../src/core/convert.ts';
import { profiles } from '../../src/profiles/index.ts';
import { validateProfiles } from '../../src/core/profile-schema.ts';
import { hookRegistry } from '../../src/hooks/chatgpt.ts';
import { parseDocument } from '../../src/core/dom.ts';
import { extract } from '../../src/core/extract.ts';
import type { ConvertResult } from '../../src/core/document-model.ts';
import type { ConversationProfile, DocumentProfile } from '../../src/core/profile.ts';

const codes = (result: ConvertResult) => result.warnings.map(({ code, itemIndex }) => ({ code, ...(itemIndex === undefined ? {} : { itemIndex }) }));
const turn = (number: number | string, html: string, role = 'assistant') => `<section data-testid="conversation-turn-${number}" data-turn="${role}">${html}</section>`;

describe('profile engine', () => {
  it.each([
    ['<main>outside<article><p>one</p></article><article><p>two</p></article></main>', 'one\n\ntwo\n'],
    ['<article><p>outer</p><article>inner</article></article>', 'outer\n\ninner\n'],
    ['<main>first</main><main>second</main>', 'first\n\nsecond\n'],
    ['<article><nav>menu</nav><p>body</p></article>', 'body\n'],
  ])('selects outermost matches from the first existing candidate', (html, markdown) => {
    expect(success(convert(html)).markdown).toBe(markdown);
  });

  it('includes the selection root and preserves multiple response blocks', () => {
    const result = convert('<div data-message-author-role="assistant"><div class="markdown"><h1>one</h1></div><div class="markdown"><p>two</p></div></div>');
    expect(conversation(result).items).toHaveLength(1);
    expect(success(result).markdown).toContain('### one\n\ntwo\n');
    expect(codes(result)).toEqual([{ code: 'COMPLETENESS_UNVERIFIED' }]);
  });

  it('does not retry when the first content match is empty', () => {
    const result = convert(turn(0, '<div data-message-author-role="assistant"><div class="markdown"></div>fallback text</div>'));
    assert.ok(!result.ok);
    expect(result.error.code).toBe('NO_CONTENT');
    expect(codes(result)).toEqual([{ code: 'COMPLETENESS_UNVERIFIED' }, { code: 'EMPTY_MESSAGE', itemIndex: 0 }]);
  });

  it('prioritizes turn role and keeps group content while excluding UI', () => {
    const result = convert(turn(0, '<div data-message-author-role="assistant" role="group">keep<button>copy</button><nav>menu</nav><span role="toolbar">tools</span></div>', 'user'));
    expect(conversation(result).items[0].role).toBe('user');
    expect(success(result).markdown).toContain('## User\n\nkeep');
    expect(codes(result)).toEqual([{ code: 'COMPLETENESS_UNVERIFIED' }, { code: 'CONTENT_FALLBACK', itemIndex: 0 }, { code: 'ROLE_CONFLICT', itemIndex: 0 }]);
  });

  it('resolves author-only roles, retains unknown roles and original item indices', () => {
    const result = convert(turn(0, '<button>empty</button>') + turn(1, '<p>unknown</p>', 'tool') + turn(2, '<div data-message-author-role="user">question</div>', 'bad'));
    expect(conversation(result).items.map(item => item.role)).toEqual(['unknown', 'user']);
    expect(codes(result)).toEqual([
      { code: 'COMPLETENESS_UNVERIFIED' },
      { code: 'CONTENT_FALLBACK', itemIndex: 0 }, { code: 'EMPTY_MESSAGE', itemIndex: 0 },
      { code: 'CONTENT_FALLBACK', itemIndex: 1 }, { code: 'UNKNOWN_ROLE', itemIndex: 1 },
    ]);
  });

  it.each([
    [[0, 1], []], [[1, 2], []], [[5, 7], ['POSSIBLE_MISSING_START', 'MISSING_TURNS']],
    [[2, 1], ['TURN_SEQUENCE_INVALID']], [[3, 3], ['POSSIBLE_MISSING_START', 'TURN_SEQUENCE_INVALID']],
    [['x', 5], []], [['01', 5], []], [['9007199254740992', 5], []],
  ])('inspects turn sequence %j without reordering', (numbers, extra) => {
    const result = convert(numbers.map(number => turn(number, '<div data-message-author-role="assistant">text</div>')).join(''));
    expect(codes(result).map(w => w.code)).toEqual(['COMPLETENESS_UNVERIFIED', ...extra]);
    expect(conversation(result).items).toHaveLength(numbers.length);
  });

  it('applies excludes to clones and includes selected roots in excludes', () => {
    const root = parseDocument('<main><p>keep</p><p class="omit">omit</p></main>').body;
    const profile: DocumentProfile = { id: 'test', name: 'Test', documentType: 'document', content: { selectors: ['p'] }, exclude: ['.omit'] };
    const document = extract(root, profile, {}, []);
    assert.ok(document.type === 'document');
    expect(document.html).toBe('<p>keep</p>\n');
    expect(root.querySelectorAll('p')).toHaveLength(2);
  });

  it('sanitizes hook output again and exposes strings rather than DOM', () => {
    const custom = createConverter(profiles, { ...hookRegistry, normalizeContent: { chatgptNormalizeContent() { return { html: '<p onclick="secret()" style="display:block">safe<script>secret()</script></p>', warnings: [] }; } } });
    const result = custom('<div data-message-author-role="assistant">source</div>');
    expect(conversation(result).items[0].html).toBe('<p>safe</p>');
    expect(JSON.parse(JSON.stringify(success(result).document))).toEqual(success(result).document);
  });
});

describe('profile validation', () => {
  it.each([
    (p: ConversationProfile) => {
      // @ts-expect-error Deliberately malformed input must also fail at runtime.
      p.surprise = true;
    },
    (p: ConversationProfile) => { p.items.selectors = []; },
    (p: ConversationProfile) => { p.items.content.selectors.assistant = ['[']; },
    (p: ConversationProfile) => { p.hooks!.normalizeContent = 'missing'; },
    (p: ConversationProfile) => { p.hooks!.normalizeContent = 'toString'; },
    (p: ConversationProfile) => { p.hooks!.normalizeContent = 'chatgptResolveRole'; },
    (p: ConversationProfile) => {
      // @ts-expect-error Both detection operators are invalid.
      p.detect = { any: ['p'], all: ['p'] };
    },
    (p: ConversationProfile) => {
      // @ts-expect-error Only message items are supported.
      p.items.type = 'other';
    },
    (p: ConversationProfile) => {
      // @ts-expect-error Unknown roles must fail validation.
      p.items.role!.map!.user = 'other';
    },
    (p: ConversationProfile) => {
      // @ts-expect-error Selector maps must contain only the supported roles.
      p.items.content.selectors.extra = ['p'];
    },
  ])('rejects malformed profiles at validation and conversion time', mutate => {
    const changed = structuredClone(profiles);
    assert.ok(changed[0].documentType === 'conversation');
    mutate(changed[0]);
    expect(() => validateProfiles(changed, hookRegistry)).toThrow('INVALID_PROFILE');
    expect(createConverter(changed, hookRegistry)('hello')).toMatchObject({ ok: false, error: { code: 'INVALID_PROFILE' } });
  });

  it('rejects duplicate IDs', () => {
    expect(() => validateProfiles([profiles[0], profiles[0]], hookRegistry)).toThrow('INVALID_PROFILE');
  });

  it('supports all detection, registration order and unknown attribute maps', () => {
    const first: DocumentProfile = { id: 'first', name: 'First', documentType: 'document', content: { selectors: ['body'] }, detect: { all: ['p', 'strong'] } };
    const second = { ...first, id: 'second', detect: { any: ['p'] } };
    const custom = createConverter([first, second, profiles[1]]);
    expect(custom('<p><strong>both</strong></p>').profileId).toBe('first');
    expect(custom('<p>one</p>').profileId).toBe('second');
    expect(custom('none').profileId).toBe('generic-html');
    const profile = structuredClone(profiles[0]);
    assert.ok(profile.documentType === 'conversation');
    delete profile.hooks;
    delete profile.items.role!.attribute;
    const withoutHooks = createConverter([profile]);
    expect(withoutHooks('text', { mode: profile.id })).toMatchObject({ ok: false, error: { code: 'NO_ITEMS' } });
    expect(conversation(withoutHooks(turn(0, 'text'), { mode: profile.id })).items[0].role).toBe('unknown');
  });
});

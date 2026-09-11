import { describe, it, expect } from 'vitest';
import { convert, createConverter } from '../../src/core/convert.ts';
import { profiles } from '../../src/profiles/index.ts';
import { hookRegistry } from '../../src/hooks/chatgpt.ts';

describe('source detection and errors', () => {
  it.each([
    ['<article>article</article>', 'generic-html'],
    ['hello', 'generic-html'],
    ['<div data-message-author-role="assistant">answer</div>', 'chatgpt-conversation'],
    ['<section data-testid="conversation-turn-x">answer</section>', 'chatgpt-conversation'],
    ['<div data-message-author-role="tool">tool</div>', 'generic-html'],
    ['<div hidden data-message-author-role="user">hidden</div><p>article</p>', 'generic-html'],
    ['<template><div data-message-author-role="user">hidden</div></template><p>article</p>', 'generic-html'],
  ])('detects only safe content: %s', (html, profileId) => {
    expect(convert(html)).toMatchObject({ ok: true, profileId });
  });

  it('manual generic mode does not infer speakers', () => {
    expect(convert('<div data-message-author-role="user">hello</div>', { mode: 'generic-html' })).toMatchObject({ markdown: 'hello\n', document: { type: 'document' } });
  });

  it('never retries another profile on extraction failure', () => {
    expect(convert('<article>Hello</article>', { mode: 'chatgpt-conversation' })).toMatchObject({ ok: false, profileId: 'chatgpt-conversation', error: { code: 'NO_ITEMS' }, warnings: [] });
    expect(convert('<div data-message-author-role="assistant"></div><article>Hello</article>')).toMatchObject({ ok: false, profileId: 'chatgpt-conversation', error: { code: 'NO_CONTENT' } });
  });

  it('prioritizes invalid mode over empty input', () => {
    expect(convert(' ', { mode: 'missing' })).toEqual({ ok: false, profileId: null, error: expect.objectContaining({ code: 'INVALID_MODE' }), warnings: [] });
    expect(convert(' \n\t')).toMatchObject({ ok: false, profileId: null, error: { code: 'EMPTY_INPUT' } });
    expect(convert('<script>alert(1)</script>')).toMatchObject({ ok: false, error: { code: 'NO_CONTENT' } });
  });

  it('contains unexpected hook failures without exposing input or stack', () => {
    const custom = createConverter(profiles, { ...hookRegistry, normalizeContent: { chatgptNormalizeContent() { throw new Error('SECRET HTML'); } } });
    const result = custom('<div data-message-author-role="user">SECRET HTML</div>');
    expect(result).toMatchObject({ ok: false, error: { code: 'CONVERSION_FAILED' }, warnings: [{ code: 'COMPLETENESS_UNVERIFIED' }] });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result).not.toHaveProperty('markdown');
    expect(result).not.toHaveProperty('document');
  });
});

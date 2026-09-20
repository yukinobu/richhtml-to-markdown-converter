import { describe, expect, it } from 'vitest';
import { createChatgptCollection } from '../../src/core/chatgpt-collection.ts';
import { convert } from '../../src/core/convert.ts';
import { success } from '../assertions.ts';

const turn = (number: number, text = `本文${number}`, id = `message-${number}`) =>
  `<article data-testid="conversation-turn-${number}" data-turn="user"><div data-message-author-role="user" data-message-id="${id}"><p>${text}</p></div></article>`;

describe('ChatGPT fragment collection', () => {
  it('merges the eight captured viewport ranges with a repeated tail (synthetic content)', () => {
    // Topology observed in chatgpt_20260920_in-01..08; no private text or IDs.
    const viewports = [[1, 2, 3, 4], [2, 3, 4, 5, 6], [4, 5, 6, 7, 8], [6, 7, 8, 9, 10],
      [8, 9, 10, 11, 12], [10, 11, 12, 13, 14], [12, 13, 14], [16, 17, 18]];
    const collection = createChatgptCollection();
    let added = 0;
    let duplicates = 0;
    for (const viewport of viewports) {
      const result = collection.add([...viewport, 28, 29, 30, 31, 32].map(number => turn(number)).join(''));
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      added += result.added;
      duplicates += result.duplicates;
    }
    expect({ added, duplicates }).toEqual({ added: 22, duplicates: 53 });
    expect(collection.snapshot).toMatchObject({
      count: 22,
      ranges: [{ start: 1, end: 14 }, { start: 16, end: 18 }, { start: 28, end: 32 }],
      gaps: [{ start: 15, end: 15 }, { start: 19, end: 27 }],
    });
  });

  it('fills gaps, deduplicates overlaps, sorts turns and preserves repeated text with distinct IDs', () => {
    const collection = createChatgptCollection();
    expect(collection.add(turn(4) + turn(1, '同じ質問'))).toMatchObject({ ok: true, added: 2, duplicates: 0 });
    expect(collection.snapshot).toMatchObject({ count: 2, ranges: [{ start: 1, end: 1 }, { start: 4, end: 4 }], gaps: [{ start: 2, end: 3, before: 'User: 同じ質問', after: 'User: 本文4' }] });
    expect(collection.add(turn(2, '同じ質問') + turn(1, '同じ質問'))).toMatchObject({ ok: true, added: 1, duplicates: 1 });
    expect(collection.add(turn(3) + turn(4))).toMatchObject({ ok: true, added: 1, duplicates: 1 });
    expect(collection.snapshot).toMatchObject({ count: 4, ranges: [{ start: 1, end: 4 }], gaps: [], possibleMissingStart: false });
    expect(collection.snapshot!.result.markdown).toBe(success(convert(turn(1, '同じ質問') + turn(2, '同じ質問') + turn(3) + turn(4))).markdown);
  });

  it('is independent of input order and repeated pastes', () => {
    const inputs = [turn(1) + turn(2) + turn(8), turn(2) + turn(3) + turn(8), turn(4) + turn(8)];
    const forward = createChatgptCollection();
    const reverse = createChatgptCollection();
    inputs.forEach(html => forward.add(html));
    [...inputs].reverse().forEach(html => reverse.add(html));
    expect(reverse.snapshot).toEqual(forward.snapshot);
    expect(reverse.add(inputs[0])).toMatchObject({ ok: true, added: 0, duplicates: 3 });
    expect(reverse.snapshot).toEqual(forward.snapshot);
  });

  it('compares converted content instead of incidental DOM attributes', () => {
    const collection = createChatgptCollection();
    collection.add(turn(1));
    expect(collection.add(turn(1).replace('<p>', '<p class="changed" data-ui="new">'))).toMatchObject({ ok: true, added: 0, duplicates: 1 });
  });

  it('keeps every message in a multi-message assistant turn', () => {
    const html = '<article data-testid="conversation-turn-2" data-turn="assistant">'
      + '<div data-message-author-role="assistant" data-message-id="a"><div class="markdown">確認します。</div></div>'
      + '<div data-message-author-role="assistant" data-message-id="b"><div class="markdown"><pre><code class="language-js">hello();</code></pre></div></div></article>';
    const collection = createChatgptCollection();
    collection.add(html);
    expect(collection.add(html)).toMatchObject({ ok: true, added: 0, duplicates: 1 });
    expect(collection.snapshot!.result.markdown).toContain('確認します。\n\n```js\nhello();\n```');
  });

  it.each([
    ['changed body', turn(1, '変更後')],
    ['changed ID', turn(1, '本文1', 'different')],
    ['reused ID at another number', turn(3, '本文1', 'message-1')],
    ['changed role', turn(1).replaceAll('"user"', '"assistant"')],
    ['changed link', turn(1, '<a href="https://example.com/changed">本文1</a>')],
  ])('rejects an entire batch on %s and preserves prior output', (_, conflict) => {
    const collection = createChatgptCollection();
    collection.add(turn(1));
    const before = collection.snapshot;
    expect(collection.add(turn(2) + conflict)).toMatchObject({ ok: false });
    expect(collection.snapshot).toBe(before);
    expect(collection.add(turn(2))).toMatchObject({ ok: true, added: 1 });
  });

  it.each([
    '', '<p>plain HTML</p>',
    '<div data-message-author-role="user" data-message-id="a">番号なし</div>',
    turn(1).replace('data-message-id="message-1"', ''),
    turn(1).replace('conversation-turn-1', 'conversation-turn-01'),
    turn(1).replace('conversation-turn-1', 'conversation-turn-9007199254740992'),
    turn(1, ''),
    turn(1).replace('data-turn="user"', 'data-turn="assistant"'),
    turn(1).replaceAll('"user"', '"unknown"'),
  ])('does not count unidentifiable or empty input as acquired: %s', html => {
    const collection = createChatgptCollection();
    expect(collection.add(html).ok).toBe(false);
    expect(collection.snapshot).toBeNull();
  });

  it('detects conflicts within the first paste without keeping a partial collection', () => {
    const collection = createChatgptCollection();
    expect(collection.add(turn(1) + turn(1, '別の本文')).ok).toBe(false);
    expect(collection.snapshot).toBeNull();
  });

  it('deduplicates repeated turns in the same paste', () => {
    expect(createChatgptCollection().add(turn(1) + turn(1))).toMatchObject({ ok: true, added: 1, duplicates: 1 });
  });

  it('supports zero-based numbering and reports a possible missing beginning separately', () => {
    const collection = createChatgptCollection();
    collection.add(turn(5));
    expect(collection.snapshot).toMatchObject({ possibleMissingStart: true, gaps: [] });
    collection.add(turn(0) + turn(1));
    expect(collection.snapshot).toMatchObject({ possibleMissingStart: false, gaps: [{ start: 2, end: 4 }] });
  });

  it('represents large gaps as ranges without enumerating missing numbers', () => {
    const collection = createChatgptCollection();
    collection.add(turn(1) + turn(Number.MAX_SAFE_INTEGER));
    expect(collection.snapshot!.gaps).toMatchObject([{ start: 2, end: Number.MAX_SAFE_INTEGER - 1 }]);
  });

  it('reset permits a different conversation with the same turn numbers', () => {
    const collection = createChatgptCollection();
    collection.add(turn(1));
    collection.reset();
    expect(collection.snapshot).toBeNull();
    expect(collection.add(turn(1, '別の会話', 'other'))).toMatchObject({ ok: true, added: 1 });
  });
});

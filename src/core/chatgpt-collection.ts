import { convert } from './convert.ts';
import { fragmentRoot, outermost, parseDocument, sanitize } from './dom.ts';
import type { ConvertResult } from './document-model.ts';

type Turn = { number: number; ids: string[]; html: string; markdown: string; preview: string };
export type TurnRange = { start: number; end: number };
export type CollectionSnapshot = {
  count: number;
  ranges: TurnRange[];
  gaps: (TurnRange & { before: string; after: string })[];
  possibleMissingStart: boolean;
  result: Extract<ConvertResult, { ok: true }>;
};
export type AddResult =
  | { ok: true; added: number; duplicates: number; snapshot: CollectionSnapshot }
  | { ok: false; message: string };

export const formatRange = ({ start, end }: TurnRange) => start === end ? String(start) : `${start}〜${end}`;

// A collection is explicitly scoped by the user to one conversation. Turn
// numbers give order, while all message IDs in a turn establish identity.
// Keep this state outside the generic document model and Markdown renderer.
export function createChatgptCollection() {
  let turns = new Map<number, Turn>();
  let snapshot: CollectionSnapshot | null = null;
  const reject = (message: string): AddResult => ({ ok: false, message });
  return {
    get snapshot() { return snapshot; },
    reset() { turns = new Map(); snapshot = null; },
    add(html: string): AddResult {
      try {
        if (!html.trim()) return reject('HTMLを入力してください。');
        const root = sanitize(parseDocument(html).body);
        const nodes = outermost([...root.querySelectorAll('[data-testid^="conversation-turn-"]')]);
        if (!nodes.length) return reject('ターン番号付きの会話がありません。ChatGPTのDeveloper Toolsで会話を含む要素を「Copy element」してください。');
        const next = new Map(turns);
        const owners = new Map([...turns.values()].flatMap(turn => turn.ids.map(id => [id, turn.number] as const)));
        let added = 0;
        let duplicates = 0;
        for (const node of nodes) {
          const match = /^conversation-turn-(0|[1-9][0-9]*)$/.exec(node.getAttribute('data-testid') ?? '');
          if (!match || !Number.isSafeInteger(Number(match[1]))) return reject('ターン番号を確認できない発言があります。会話を含む要素をコピーし直してください。');
          const number = Number(match[1]);
          const messages = [...node.querySelectorAll('[data-message-author-role]')];
          const ids = messages.map(message => message.getAttribute('data-message-id') ?? '');
          if (!ids.length || ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) {
            return reject(`発言${number}のメッセージIDを確認できません。Developer Toolsの「Copy element」でコピーし直してください。`);
          }
          const result = convert(node.outerHTML, { mode: 'chatgpt-conversation' });
          if (!result.ok || result.document.type !== 'conversation' || result.document.items.length !== 1
            || result.warnings.some(warning => ['UNKNOWN_ROLE', 'ROLE_CONFLICT', 'EMPTY_MESSAGE'].includes(warning.code))) {
            return reject(`発言${number}の本文または話者を確認できません。表示が完了してからコピーし直してください。`);
          }
          const item = result.document.items[0];
          const text = fragmentRoot(item.html).textContent.replace(/\s+/g, ' ').trim();
          const preview = `${item.role === 'user' ? 'User' : 'Assistant'}: ${text.length > 80 ? text.slice(0, 80) + '…' : text}`;
          const previous = next.get(number);
          if (previous && JSON.stringify(previous.ids) !== JSON.stringify(ids)
            || ids.some(id => owners.has(id) && owners.get(id) !== number)) {
            return reject(`発言${number}の識別情報が取得済みの会話と異なります。別の会話や分岐が混ざっていないか確認してください。別の会話を始める場合は取り込みをリセットしてください。`);
          }
          if (previous && previous.markdown !== result.markdown) {
            return reject(`発言${number}の本文が取得済みの内容と競合しています。編集・再生成・生成途中の可能性があります。取得済み「${previous.preview}」／今回「${preview}」。更新後の会話を取り込む場合はリセットして取り直してください。`);
          }
          if (previous) { duplicates++; continue; }
          next.set(number, { number, ids, html: node.outerHTML, markdown: result.markdown, preview });
          for (const id of ids) owners.set(id, number);
          added++;
        }
        const sorted = [...next.values()].sort((a, b) => a.number - b.number);
        const result = convert(sorted.map(turn => turn.html).join('\n'), { mode: 'chatgpt-conversation' });
        if (!result.ok) return reject(result.error.message);
        const ranges: TurnRange[] = [];
        const gaps: CollectionSnapshot['gaps'] = [];
        sorted.forEach((turn, index) => {
          const previous = sorted[index - 1];
          if (previous && turn.number - previous.number === 1) ranges[ranges.length - 1].end = turn.number;
          else {
            ranges.push({ start: turn.number, end: turn.number });
            if (previous) gaps.push({ start: previous.number + 1, end: turn.number - 1, before: previous.preview, after: turn.preview });
          }
        });
        // Commit only after every turn and the combined conversion succeeds.
        snapshot = { count: sorted.length, ranges, gaps, possibleMissingStart: sorted[0].number > 1, result };
        turns = next;
        return { ok: true, added, duplicates, snapshot };
      } catch {
        return reject('取り込みに失敗しました。入力内容を確認してください。');
      }
    },
  };
}

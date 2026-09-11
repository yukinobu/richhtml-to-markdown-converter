import type { Diagnostic } from './document-model.ts';

const messages: Record<string, string> = {
  EMPTY_INPUT: 'HTMLを入力してください。',
  INVALID_MODE: '指定された変換モードは利用できません。',
  INVALID_PROFILE: '変換Profileの定義が不正です。',
  NO_ITEMS: '会話のメッセージを検出できませんでした。変換モードを確認してください。',
  NO_CONTENT: '変換可能な本文がありません。',
  CONVERSION_FAILED: '変換に失敗しました。入力内容を確認してください。',
  COMPLETENESS_UNVERIFIED: '会話の完全性は確認できません。必要なメッセージが含まれているか確認してください。',
  POSSIBLE_MISSING_START: '会話の先頭が含まれていない可能性があります。',
  TURN_SEQUENCE_INVALID: 'ターン番号に重複または逆転があります。入力の順序で出力します。',
  MISSING_TURNS: 'ターン番号に欠番があります。会話の一部が欠けている可能性があります。',
  ROLE_CONFLICT: '話者属性が矛盾しています。ターンの話者属性を優先します。',
  UNKNOWN_ROLE: '話者を判定できないメッセージがあります。',
  CONTENT_FALLBACK: '本文の候補が見つからないため、ターン全体から抽出しました。',
  EMPTY_MESSAGE: '本文が空のメッセージを除外しました。',
  URL_DROPPED: '対応していないURLを除き、本文または代替テキストを残しました。',
  TABLE_FLATTENED: '複雑な表を行ごとのテキストに変換しました。',
  LIST_NUMBERING_NORMALIZED: 'リストの逆順指定または個別の番号指定を通常の連番に変換しました。',
};

export function diagnostic(code: string, itemIndex?: number): Diagnostic {
  return { code, message: messages[code] ?? code, ...(itemIndex === undefined ? {} : { itemIndex }) };
}

export class ConversionError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}

const inspectionOrder = ['COMPLETENESS_UNVERIFIED', 'POSSIBLE_MISSING_START', 'TURN_SEQUENCE_INVALID', 'MISSING_TURNS'];
export function sortWarnings(warnings: Diagnostic[]): Diagnostic[] {
  const first = new Map<string, Diagnostic>();
  for (const warning of warnings) {
    const key = `${warning.code}:${warning.itemIndex ?? ''}`;
    if (!first.has(key)) first.set(key, warning);
  }
  const unique = [...first.values()];
  const rank = (warning: Diagnostic) => warning.itemIndex === undefined && inspectionOrder.includes(warning.code)
    ? inspectionOrder.indexOf(warning.code) - 5 : (warning.itemIndex ?? 0);
  return unique.sort((a, b) => rank(a) - rank(b) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

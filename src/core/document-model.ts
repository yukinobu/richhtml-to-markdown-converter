export type Role = 'user' | 'assistant' | 'unknown';
export type Message = { type: 'message'; role: Role; html: string };
export type ConversationDocument = { type: 'conversation'; metadata: { source: string }; items: Message[] };
export type HtmlDocument = { type: 'document'; metadata: { source: string }; html: string };
export type SemanticDocument = ConversationDocument | HtmlDocument;
export type Diagnostic = { code: string; message: string; itemIndex?: number };
export type ConvertResult =
  | { ok: true; profileId: string; document: SemanticDocument; markdown: string; warnings: Diagnostic[] }
  | { ok: false; profileId: string | null; error: Diagnostic; warnings: Diagnostic[] };

export function conversation(items: Message[], source: string): ConversationDocument {
  return { type: 'conversation', metadata: { source }, items };
}

export function document(html: string, source: string): HtmlDocument {
  return { type: 'document', metadata: { source }, html };
}

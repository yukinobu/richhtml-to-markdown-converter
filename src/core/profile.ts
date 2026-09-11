import type { Diagnostic, Role } from './document-model.ts';

export type ContentContext = { role?: Role; itemIndex?: number };
export type Hooks = {
  resolveRole: (item: Element, mappedRole: Role, itemIndex: number) => { role: Role; warnings: Diagnostic[] };
  normalizeContent: (html: string, context: ContentContext) => { html: string; warnings: Diagnostic[] };
  inspectDocument: (root: Element, items: Element[]) => { warnings: Diagnostic[] };
};
export type HookRegistry = { [K in keyof Hooks]?: Record<string, Hooks[K]> };

type ProfileBase = {
  id: string;
  name: string;
  detect?: { all: string[]; any?: never } | { any: string[]; all?: never };
  exclude?: string[];
  hooks?: Partial<Record<keyof Hooks, string>>;
};
export type DocumentProfile = ProfileBase & {
  documentType: 'document';
  content: { selectors: string[] };
  items?: never;
};
export type ConversationProfile = ProfileBase & {
  documentType: 'conversation';
  content?: never;
  items: {
    selectors: string[];
    type: 'message';
    role?: { attribute?: string; map?: Record<string, Role> };
    content: { selectors: Record<Role, string[]> };
    exclude?: string[];
  };
};
export type Profile = DocumentProfile | ConversationProfile;

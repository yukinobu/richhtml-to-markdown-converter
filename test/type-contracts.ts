// Compile-only checks, included by npm run typecheck.
import type { ConvertResult, Message } from '../src/core/document-model.ts';
import type { HookRegistry } from '../src/core/profile.ts';
import { chatgptNormalizeContent } from '../src/hooks/chatgpt.ts';

declare const result: ConvertResult;
if (result.ok) {
  result.markdown.toUpperCase();
  // @ts-expect-error Successful conversions do not have an error.
  result.error;
  if (result.document.type === 'conversation') {
    result.document.items.map(item => item.html);
    // @ts-expect-error Conversation content belongs to individual messages.
    result.document.html;
  } else {
    result.document.html.toUpperCase();
    // @ts-expect-error A plain document does not have conversation items.
    result.document.items;
  }
} else {
  result.error.message.toUpperCase();
  // @ts-expect-error Failed conversions do not expose partial Markdown.
  result.markdown;
}

// @ts-expect-error Message roles are restricted to the supported values.
const invalidRole: Message['role'] = 'system';

const registry: HookRegistry = {
  normalizeContent: { chatgptNormalizeContent },
  resolveRole: {
    // @ts-expect-error A content normalizer cannot be registered as a role resolver.
    chatgptNormalizeContent,
  },
};

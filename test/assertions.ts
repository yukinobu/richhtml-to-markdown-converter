import assert from 'node:assert/strict';
import type { ConvertResult } from '../src/core/document-model.ts';

export function success(result: ConvertResult) {
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}

export function conversation(result: ConvertResult) {
  const { document } = success(result);
  assert.ok(document.type === 'conversation');
  return document;
}

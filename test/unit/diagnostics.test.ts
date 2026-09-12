import { it, expect } from 'vitest';
import { sortWarnings } from '../../src/core/diagnostics.ts';

it('keeps the first diagnostic per code and original item index in specified order', () => {
  const first = { code: 'URL_DROPPED', itemIndex: 2, message: 'first' };
  expect(sortWarnings([
    first,
    { code: 'URL_DROPPED', itemIndex: 2, message: 'later' },
    { code: 'UNKNOWN_ROLE', itemIndex: 1, message: 'unknown' },
    { code: 'CONTENT_FALLBACK', itemIndex: 1, message: 'fallback' },
    { code: 'MISSING_TURNS', message: 'missing' },
    { code: 'COMPLETENESS_UNVERIFIED', message: 'unverified' },
  ])).toEqual([
    { code: 'COMPLETENESS_UNVERIFIED', message: 'unverified' },
    { code: 'MISSING_TURNS', message: 'missing' },
    { code: 'CONTENT_FALLBACK', itemIndex: 1, message: 'fallback' },
    { code: 'UNKNOWN_ROLE', itemIndex: 1, message: 'unknown' },
    first,
  ]);
});

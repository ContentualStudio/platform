import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CompletionSuggestionResolution1793050000000 } from './migrations/1793050000000-CompletionSuggestionResolution';

test('rollout seeds delivered completion history without re-ranking dismissed candidates', async () => {
  const statements: string[] = [];
  await new CompletionSuggestionResolution1793050000000().up({ query: async (sql: string) => { statements.push(sql); } } as never);
  const backfill = statements.find(sql => sql.includes('INSERT INTO "programme_completion_suggestion"'));
  assert.ok(backfill);
  assert.match(backfill, /e\."status" = 'delivered'/);
  assert.match(backfill, /ORDER BY s\."createdAt" DESC, s\."id" DESC LIMIT 1/);
  assert.match(backfill, /s\."userId" = e\."userId" AND s\."eventId" = e\."id"/);
});

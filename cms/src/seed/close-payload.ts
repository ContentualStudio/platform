/**
 * Shuts a seed script's Payload instance down without hanging CI.
 *
 * `payload.destroy()` can hang when the pool has already been torn down, so the
 * cleanup races a one-second timer and the process exits either way. Shared by
 * every seed runner so the timeout is tuned — or removed, once Payload no
 * longer needs it — in one place rather than three.
 */
export async function closePayload(payload: {
  db: unknown;
  destroy: () => Promise<void>;
}): Promise<void> {
  const database = payload.db as { pool?: { end: () => Promise<void> } };
  const cleanup = (async () => {
    await database.pool?.end();
    await payload.destroy();
  })().catch(() => undefined);

  await Promise.race([
    cleanup,
    new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
  ]);
}

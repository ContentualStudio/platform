// TypeORM's postgres driver returns raw rows for a RETURNING statement when
// there are any, but falls back to a [rows, affectedCount] tuple when there
// are none. Reading `.length` on the raw result would therefore see 2 for
// "nothing was inserted/updated" — which would make a lost gate look like a
// successful write. Every raw-SQL gate in the Content Engine domains reuses
// this rather than re-deriving it.
export function returnedRows<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === "number"
  ) {
    return result[0] as T[];
  }

  return Array.isArray(result) ? (result as T[]) : [];
}

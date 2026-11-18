// The narrow read seam every repository on the assignment path shares.
//
// It exists so a caller can hand a repository its *transaction's* EntityManager
// instead of the default connection: reading published content, or the active
// matching setup, outside the transaction that writes the assignment would let
// either change between the decision and the record of it. Both TypeORM's
// `DataSource` and `EntityManager` satisfy it structurally.
export interface SqlQueryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown[]>;
}

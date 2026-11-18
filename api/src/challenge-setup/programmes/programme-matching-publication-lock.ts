import { InternalServerErrorException } from "@nestjs/common";

export const PROGRAMME_MATCHING_PUBLICATION_LOCK =
  "programme-matching-publication";

interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown[]>;
}

export async function lockProgrammeMatchingPublication(
  queryable: Queryable,
): Promise<void> {
  await queryable.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    PROGRAMME_MATCHING_PUBLICATION_LOCK,
  ]);
}

export async function assertProgrammeVersionEligible(
  queryable: Queryable,
  programmeVersionId: string,
): Promise<void> {
  const rows = await queryable.query(
    `SELECT 1
     FROM "programme_content_versions" version
     JOIN "programme_matching_target_eligibility" eligibility
       ON eligibility."sourceDocumentId" = version."sourceDocumentId"
     WHERE version."programmeVersionId" = $1
       AND eligibility."eligible" = true
     LIMIT 1`,
    [programmeVersionId],
  );

  if (rows.length === 0) {
    throw new InternalServerErrorException({
      code: "PROGRAMME_CONTENT_UNAVAILABLE",
      message: "The matched programme is not eligible for new assignments.",
    });
  }
}

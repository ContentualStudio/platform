import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { SqlQueryable } from "../../database/queryable";
import type { ProgrammeContentSnapshot } from "./programme-content-version";

export interface ProgrammeContentVersionRecord {
  programmeVersionId: string;
  programmeKey: string;
  sourceDocumentId: string;
  sourceUpdatedAt: Date | string;
  contentHash: string;
  snapshot: ProgrammeContentSnapshot;
}

const FIND_VERSION_SQL = `
  SELECT
    "programmeVersionId", "programmeKey", "sourceDocumentId",
    "sourceUpdatedAt", "contentHash", "snapshot"
  FROM "programme_content_versions"
  WHERE "programmeVersionId" = $1
  LIMIT 1
`;

/** Read-only access to the append-only programme publication table. */
@Injectable()
export class ProgrammeVersionRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findById(
    programmeVersionId: string,
    queryable: SqlQueryable = this.dataSource,
  ): Promise<ProgrammeContentVersionRecord | undefined> {
    const rows = (await queryable.query(FIND_VERSION_SQL, [
      programmeVersionId,
    ])) as ProgrammeContentVersionRecord[];
    const row = rows[0];

    if (!row) {
      return undefined;
    }

    return {
      ...row,
      snapshot:
        typeof row.snapshot === "string"
          ? (JSON.parse(row.snapshot) as ProgrammeContentSnapshot)
          : row.snapshot,
    };
  }
}

import { Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import type { ContentEvent } from "../content-engine/content-event";

interface Candidate {
  id: string;
  programmeId: string;
  ruleId: string;
  priority: number;
}

export function selectSuggestionWinner(
  rows: Candidate[],
  active: ReadonlySet<string>,
): Candidate | null {
  return (
    rows
      .filter((row) => active.has(row.programmeId))
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0) ||
          (BigInt(a.id) < BigInt(b.id)
            ? -1
            : BigInt(a.id) > BigInt(b.id)
              ? 1
              : 0),
      )[0] ?? null
  );
}

/** Completion resolution owns state, never the effect records or enrolment. */
@Injectable()
export class CompletionSuggestionResolver {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly content: ProgrammeContentReader,
  ) {}

  async resolve(event: ContentEvent): Promise<void> {
    if (event.eventName !== "programme.completed") return;
    await this.dataSource.transaction(async (manager) => {
      // Serialize finalization per user, including concurrent replays.
      await manager.query(
        'SELECT "id" FROM "user" WHERE "id" = $1 FOR UPDATE',
        [event.userId],
      );
      const existing = await manager.query(
        'SELECT "eventId" FROM "programme_completion_suggestion" WHERE "userId" = $1 AND "eventId" = $2',
        [event.userId, event.id],
      );
      if (existing.length) return;
      const rows: Candidate[] = await manager.query(
        'SELECT "id", "programmeId", "ruleId", "priority" FROM "engine_programme_suggestion" WHERE "userId" = $1 AND "eventId" = $2',
        [event.userId, event.id],
      );
      const active =
        await this.content.listActiveProgrammesWithIdentity(manager);
      const winner = selectSuggestionWinner(
        rows,
        new Set(active.map((row) => row.sourceDocumentId)),
      );
      await manager.query(
        `INSERT INTO "programme_completion_suggestion" ("userId", "eventId", "suggestionId", "programmeSlug", "createdAt")
        SELECT $1, $2, $3, $4, "createdAt" FROM "content_engine_events"
        WHERE "id" = $2 AND "userId" = $1 AND "eventName" = 'programme.completed'
        ON CONFLICT ("userId", "eventId") DO NOTHING`,
        [
          event.userId,
          event.id,
          winner?.id ?? null,
          active.find((row) => row.sourceDocumentId === winner?.programmeId)
            ?.programme.id ?? null,
        ],
      );
    });
  }
}

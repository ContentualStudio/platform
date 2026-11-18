import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { isBigserialId } from "../common/bigserial-id";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentReader,
} from "../challenge-setup/programmes/programme-content.repository";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";

// A null resolution is a deliberate no-suggestion outcome and supersedes older
// suggestions. Pending completion candidates must never surface individually.
const SELECT_LATEST_SUGGESTION_SQL = `
  WITH choices AS (
    SELECT r."suggestionId" AS "id", s."programmeId", r."programmeSlug", r."createdAt", r."eventId"
    FROM "programme_completion_suggestion" r
    LEFT JOIN "engine_programme_suggestion" s ON s."id" = r."suggestionId" AND s."userId" = r."userId"
    WHERE r."userId" = $1
    UNION ALL
    SELECT s."id", s."programmeId", NULL::text, s."createdAt", s."eventId"
    FROM "engine_programme_suggestion" s
    WHERE s."userId" = $1 AND NOT EXISTS (
      SELECT 1 FROM "content_engine_events" e
      WHERE e."id" = s."eventId" AND e."userId" = s."userId" AND e."eventName" = 'programme.completed'
    )
  )
  SELECT s.*, d."suggestionId" IS NOT NULL AS "dismissed"
  FROM choices s
  LEFT JOIN "programme_suggestion_dismissal" d ON d."suggestionId" = s."id"
  ORDER BY s."createdAt" DESC, s."eventId" DESC, s."id" DESC
  LIMIT 1
`;

// Any start of the suggested programme since the suggestion was recorded,
// whichever path made it, resolves the suggestion.
const SELECT_STARTED_SINCE_SQL = `
  SELECT 1
  FROM "programme_enrolment"
  WHERE "userId" = $1 AND ("programmeSlug" = $2 OR "programmeSlug" = $4) AND "startedAt" >= $3
  LIMIT 1
`;

// The Welcome Page and the start path both send an unfinished setup back to
// the questionnaire, so a suggestion before then would only duplicate the
// dashboard's own "Get Started".
const SELECT_SETUP_COMPLETED_SQL = `
  SELECT 1
  FROM "challenge_setup"
  WHERE "userId" = $1 AND "setupCompletedAt" IS NOT NULL
`;

const SELECT_OWNED_SUGGESTION_SQL = `
  SELECT 1
  FROM "engine_programme_suggestion"
  WHERE "id" = $1 AND "userId" = $2
`;

const INSERT_DISMISSAL_SQL = `
  INSERT INTO "programme_suggestion_dismissal" ("suggestionId", "userId")
  VALUES ($1, $2)
  ON CONFLICT ("suggestionId") DO NOTHING
`;

interface LatestSuggestionRow {
  id: string;
  programmeId: string;
  programmeSlug?: string | null;
  createdAt: Date | string;
  dismissed: boolean;
}

export interface ProgrammeSuggestion {
  /** What dismiss is keyed on: this suggestion, not the programme. */
  readonly id: string;
  /** The key the Welcome Page and start path use. Never a name. */
  readonly slug: string;
  readonly title: string;
  readonly track: string | null;
  readonly description: string | null;
}

/**
 * The single programme suggestion a user's dashboard offers, if any.
 *
 * Completion winners are durable; dismissal and acted-on checks never promote
 * a losing candidate or an older suggestion.
 */
@Injectable()
export class ProgrammeSuggestionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly enrolments: ProgrammeEnrolmentService,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
  ) {}

  async activeForUser(
    user: AuthenticatedUser,
  ): Promise<ProgrammeSuggestion | null> {
    const [latest] = (await this.dataSource.query(
      SELECT_LATEST_SUGGESTION_SQL,
      [user.id],
    )) as LatestSuggestionRow[];

    if (!latest || !latest.id || latest.dismissed) {
      return null;
    }

    const [active, running, setupCompleted] = await Promise.all([
      this.contentReader.listActiveProgrammesWithIdentity(),
      this.enrolments.findActiveForUser(user.id),
      this.dataSource.query(SELECT_SETUP_COMPLETED_SQL, [user.id]) as Promise<
        unknown[]
      >,
    ]);

    // Effect rows carry the mirror document id. A programme that is missing
    // or no longer active has no entry here and the suggestion drops out.
    const programme = active.find((entry) =>
      entry.sourceDocumentId === latest.programmeId,
    )?.programme;

    // A running programme means the suggestion either was taken up or could
    // not be started right now; the start path refuses a second journey.
    if (!programme || running || setupCompleted.length === 0) {
      return null;
    }

    const startedSince = (await this.dataSource.query(
      SELECT_STARTED_SINCE_SQL,
      [user.id, programme.id, new Date(latest.createdAt), latest.programmeSlug ?? programme.id],
    )) as unknown[];

    if (startedSince.length > 0) {
      return null;
    }

    return {
      id: String(latest.id),
      slug: programme.id,
      title: programme.title,
      track: programme.track ?? null,
      description: programme.description || null,
    };
  }

  /**
   * Idempotent. Refuses, as not found, a suggestion that is not the caller's,
   * so the response cannot be used to probe other users' ids.
   */
  async dismiss(user: AuthenticatedUser, suggestionId: string): Promise<void> {
    if (!isBigserialId(suggestionId)) {
      throw suggestionNotFound();
    }

    const owned = (await this.dataSource.query(SELECT_OWNED_SUGGESTION_SQL, [
      suggestionId,
      user.id,
    ])) as unknown[];

    if (owned.length === 0) {
      throw suggestionNotFound();
    }

    await this.dataSource.query(INSERT_DISMISSAL_SQL, [suggestionId, user.id]);
  }
}

function suggestionNotFound(): NotFoundException {
  return new NotFoundException({
    code: "SUGGESTION_NOT_FOUND",
    message: "That suggestion no longer exists.",
  });
}

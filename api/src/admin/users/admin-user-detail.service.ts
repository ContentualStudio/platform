import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { returnedRows } from "../../content-engine/returned-rows";
import { baseLevel } from "../../gamification/levels";
import type { PlatformConnectionEntity } from "../../instagram/entities/platform-connection.entity";
import { currentStreak, streakStateFrom } from "./admin-user-row";

/**
 * The read-only panels of the single-user view. Each is its own query and its
 * own endpoint, so one failing data source never blanks the others.
 */

const STREAK_SQL = `
  SELECT st."currentLength", st."longestLength", st."lastActiveDate"::text AS "lastActiveDate",
         st."brokenAt", up."timezone", ul."level"
    FROM "user" u
    LEFT JOIN "user_streak" st ON st."userId" = u."id"
    LEFT JOIN "user_profile" up ON up."userId" = u."id"
    LEFT JOIN "user_level" ul ON ul."userId" = u."id"
   WHERE u."id" = $1
`;

// Left join: a badge whose catalogue row was later deleted is still an
// earned badge; it lists by its id rather than disappearing.
const BADGES_SQL = `
  SELECT a."badgeId", b."key", b."name", b."description", a."createdAt" AS "earnedAt"
    FROM "user_achievement" a
    LEFT JOIN "engine_badges" b ON b."sourceDocumentId" = a."badgeId"
   WHERE a."userId" = $1
   ORDER BY a."createdAt" DESC
`;

// The most recent Instagram connection, live or not: a disconnected row still
// answers "were they ever connected, and as whom".
const CONNECTION_SQL = `
  SELECT "status", "username", "accountType", "connectedAt", "disconnectedAt",
         "dataConsent", "consentGrantedAt"
    FROM "platform_connection"
   WHERE "userId" = $1 AND "platform" = 'instagram'
   ORDER BY "connectionOrdinal" DESC
   LIMIT 1
`;

// "Last successful sync" is the latest daily pull that returned metrics —
// recorded already, so no separate sync column is kept.
const LAST_SYNC_SQL = `
  SELECT max("pulledAt") AS "lastSyncedAt"
    FROM "instagram_account_metric"
   WHERE "userId" = $1 AND "metricsAvailable"
`;

export interface AdminUserProgress {
  currentStreak: number;
  longestStreak: number;
  // The ticket also asked for total points and streak freeze state; the
  // product has neither, and the client chose to leave them out for now.
  level: string;
}

export interface AdminUserBadge {
  badgeId: string;
  key: string | null;
  name: string | null;
  description: string | null;
  earnedAt: string;
}

export interface AdminUserPlatform {
  instagram: {
    status: PlatformConnectionEntity["status"];
    username: string;
    accountType: PlatformConnectionEntity["accountType"];
    connectedAt: string;
    disconnectedAt: string | null;
    lastSyncedAt: string | null;
    /**
     * The data consent recorded on this connection. Consent is stored per
     * connection, so it is shown here rather than as an account-wide panel
     * (confirmed with the client).
     */
    consent: { granted: boolean; grantedAt: string | null };
  } | null;
}

const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null);

@Injectable()
export class AdminUserDetailService {
  constructor(private readonly dataSource: DataSource) {}

  async progress(userId: string, now = new Date()): Promise<AdminUserProgress> {
    const [row] = returnedRows<{
      currentLength: number | null;
      longestLength: number | null;
      lastActiveDate: string | null;
      brokenAt: Date | null;
      timezone: string | null;
      level: string | null;
    }>(await this.dataSource.query(STREAK_SQL, [userId]));

    return {
      currentStreak: currentStreak(
        streakStateFrom({
          length: row?.currentLength ?? null,
          lastActiveDate: row?.lastActiveDate ?? null,
          brokenAt: row?.brokenAt ?? null,
          timezone: row?.timezone ?? null,
        }),
        now,
      ),
      longestStreak: row?.longestLength ?? 0,
      // The level row is written on a user's first completed task, so a user
      // without one has completed none and sits at the base level.
      level: row?.level ?? baseLevel,
    };
  }

  async badges(userId: string): Promise<{ badges: AdminUserBadge[] }> {
    const rows = returnedRows<Omit<AdminUserBadge, "earnedAt"> & { earnedAt: Date }>(
      await this.dataSource.query(BADGES_SQL, [userId]),
    );

    return {
      badges: rows.map((row) => ({ ...row, earnedAt: new Date(row.earnedAt).toISOString() })),
    };
  }

  async platform(userId: string): Promise<AdminUserPlatform> {
    const [connectionResult, syncResult] = await Promise.all([
      this.dataSource.query(CONNECTION_SQL, [userId]),
      this.dataSource.query(LAST_SYNC_SQL, [userId]),
    ]);
    const [connection] = returnedRows<
      Pick<
        PlatformConnectionEntity,
        | "status"
        | "username"
        | "accountType"
        | "connectedAt"
        | "disconnectedAt"
        | "dataConsent"
        | "consentGrantedAt"
      >
    >(connectionResult);
    const [sync] = returnedRows<{ lastSyncedAt: Date | null }>(syncResult);

    if (!connection) {
      return { instagram: null };
    }

    return {
      instagram: {
        status: connection.status,
        username: connection.username,
        accountType: connection.accountType,
        connectedAt: iso(connection.connectedAt)!,
        disconnectedAt: iso(connection.disconnectedAt),
        lastSyncedAt: iso(sync?.lastSyncedAt ?? null),
        consent: {
          granted: connection.dataConsent,
          grantedAt: iso(connection.consentGrantedAt),
        },
      },
    };
  }
}

import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { currentStreak, streakStateFrom } from "../admin/users/admin-user-row";
import { returnedRows } from "../content-engine/returned-rows";

export interface EarnedBadge {
  badgeId: string;
  /** Null when the badge has since left the content mirror. */
  key: string | null;
  name: string | null;
  earnedAt: string;
}

export interface UserAchievements {
  /** The streak the user has today: a lapsed streak reads 0, not its stored length. */
  currentStreak: number;
  badges: EarnedBadge[];
}

// Left join: a badge whose catalogue row was later removed is still earned.
const BADGES_SQL = `
  SELECT a."badgeId", b."key", b."name", a."createdAt" AS "earnedAt"
    FROM "user_achievement" a
    LEFT JOIN "engine_badges" b ON b."sourceDocumentId" = a."badgeId"
   WHERE a."userId" = $1
   ORDER BY a."createdAt" DESC
`;

const STREAK_SQL = `
  SELECT st."currentLength", st."lastActiveDate"::text AS "lastActiveDate",
         st."brokenAt", up."timezone"
    FROM "user_streak" st
    LEFT JOIN "user_profile" up ON up."userId" = st."userId"
   WHERE st."userId" = $1
`;

/** The signed-in user's own badges and streak, for the Programs › Achievements tab. */
@Injectable()
export class UserAchievementsService {
  constructor(private readonly dataSource: DataSource) {}

  async forUser(userId: string, now = new Date()): Promise<UserAchievements> {
    const [badgeResult, streakResult] = await Promise.all([
      this.dataSource.query(BADGES_SQL, [userId]),
      this.dataSource.query(STREAK_SQL, [userId]),
    ]);
    const [streak] = returnedRows<{
      currentLength: number;
      lastActiveDate: string | null;
      brokenAt: Date | null;
      timezone: string | null;
    }>(streakResult);

    return {
      currentStreak: currentStreak(
        streakStateFrom({
          length: streak?.currentLength ?? null,
          lastActiveDate: streak?.lastActiveDate ?? null,
          brokenAt: streak?.brokenAt ?? null,
          timezone: streak?.timezone ?? null,
        }),
        now,
      ),
      badges: returnedRows<Omit<EarnedBadge, "earnedAt"> & { earnedAt: Date }>(badgeResult).map(
        (row) => ({ ...row, earnedAt: new Date(row.earnedAt).toISOString() }),
      ),
    };
  }
}

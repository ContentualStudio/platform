import { localDateFor, resolveTimezone } from "../../common/timezone";
import { effectiveTierFor } from "../../billing/subscription-state";
import type { TierKey } from "../../billing/billing-tiers";

/** One row as the user-list query returns it, before any rule is applied. */
export interface AdminUserListRecord {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  isFoundingCreator: boolean;
  subscriptionStatus: string | null;
  subscriptionTier: string | null;
  programmeSlug: string | null;
  programmeTitle: string | null;
  streakLength: number | null;
  streakLastActiveDate: string | null;
  streakBrokenAt: Date | null;
  timezone: string | null;
  lastSeenAt: Date | null;
  avatarVersion: string | null;
}

export interface AdminUserListRow {
  id: string;
  name: string;
  email: string;
  signedUpAt: string;
  /**
   * Changes whenever the stored avatar does; null when there is none. The
   * client puts it in the avatar URL so a replaced picture is refetched.
   */
  avatarVersion: string | null;
  isFoundingCreator: boolean;
  tier: TierKey;
  /** Null when the user has no active programme. */
  currentProgramme: {
    slug: string;
    /** Null when the programme is no longer in the content mirror. */
    title: string | null;
  } | null;
  currentStreak: number;
  /**
   * Last session activity when there is one; otherwise the day of the last
   * completed task, which carries no time of day. Null when neither exists.
   */
  lastActive: { at: string; precision: "time" | "day" } | null;
}

export interface StreakState {
  length: number;
  lastActiveDate: string;
  brokenAt: Date | null;
  timezone: string | null;
}

function previousDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const previous = new Date(Date.UTC(year!, month! - 1, day! - 1));

  return previous.toISOString().slice(0, 10);
}

/**
 * The streak a user actually has today.
 *
 * `user_streak.currentLength` is only reset by the user's next completion,
 * and `brokenAt` only by the nightly sweep, so a lapsed user can still carry
 * a long stored length. A streak counts as live while its last active day is
 * today or yesterday in the user's own timezone — yesterday because today's
 * task may simply not be done yet.
 */
export function currentStreak(streak: StreakState | null, now: Date): number {
  if (!streak || streak.brokenAt) {
    return 0;
  }

  const today = localDateFor(now, resolveTimezone(streak.timezone));

  // ISO dates compare correctly as strings.
  return streak.lastActiveDate >= previousDate(today) ? streak.length : 0;
}

/**
 * A StreakState from raw `user_streak` columns, or null when the user has no
 * streak row. Shared by the list row and the user view's progress panel.
 */
export function streakStateFrom(columns: {
  length: number | null;
  lastActiveDate: string | null;
  brokenAt: Date | null;
  timezone: string | null;
}): StreakState | null {
  return columns.length !== null && columns.lastActiveDate !== null
    ? {
        length: columns.length,
        lastActiveDate: columns.lastActiveDate,
        brokenAt: columns.brokenAt,
        timezone: columns.timezone,
      }
    : null;
}

export function toAdminUserListRow(
  record: AdminUserListRecord,
  now: Date,
): AdminUserListRow {
  const streak = streakStateFrom({
    length: record.streakLength,
    lastActiveDate: record.streakLastActiveDate,
    brokenAt: record.streakBrokenAt,
    timezone: record.timezone,
  });

  return {
    id: record.id,
    name: record.name,
    email: record.email,
    signedUpAt: record.createdAt.toISOString(),
    avatarVersion: record.avatarVersion,
    isFoundingCreator: record.isFoundingCreator,
    // A lapsed subscription keeps the tier it had; what it buys today is Free.
    tier: effectiveTierFor(record.subscriptionStatus, record.subscriptionTier),
    currentProgramme: record.programmeSlug
      ? { slug: record.programmeSlug, title: record.programmeTitle }
      : null,
    currentStreak: currentStreak(streak, now),
    lastActive: record.lastSeenAt
      ? { at: record.lastSeenAt.toISOString(), precision: "time" }
      : record.streakLastActiveDate
        ? { at: `${record.streakLastActiveDate}T00:00:00.000Z`, precision: "day" }
        : null,
  };
}

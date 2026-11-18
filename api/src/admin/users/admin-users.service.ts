import { Injectable, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { returnedRows } from "../../content-engine/returned-rows";
import {
  toAdminUserListRow,
  type AdminUserListRecord,
  type AdminUserListRow,
} from "./admin-user-row";
import { containsPattern, type AdminUsersQuery } from "./admin-users.schemas";

// $1 is the LIKE pattern, or null for "every user". Matched against the same
// lower(...) expressions the trigram indexes in AdminUserSearchIndexes cover.
const SEARCH_PREDICATE = `
  ($1::text IS NULL
    OR lower(u."name") LIKE $1 ESCAPE '\\'
    OR lower(u."email") LIKE $1 ESCAPE '\\')
`;

const COUNT_SQL = `
  SELECT count(*)::int AS "total"
    FROM "user" u
   WHERE ${SEARCH_PREDICATE}
`;

// Every join is LEFT: a user with no billing row, no programme, no streak or
// no session still lists, with those cells empty. Each joined table holds at
// most one row per user (user_subscription, billing_account, user_streak and
// user_profile are keyed by userId; programme_enrolment allows one active row
// per user), so the joins cannot multiply rows. Sessions are many per user and
// are folded to their latest activity in the lateral.
//
// The programme title is today's, joined by slug. A version-pinned journey
// started under an older title shows the current one; the single-user view is
// where the pinned title belongs.
const ROW_SQL = `
  SELECT u."id",
         u."name",
         u."email",
         u."createdAt",
         coalesce(ba."isFoundingCreator", false) AS "isFoundingCreator",
         us."status" AS "subscriptionStatus",
         us."tier" AS "subscriptionTier",
         pe."programmeSlug",
         pr."title" AS "programmeTitle",
         st."currentLength" AS "streakLength",
         st."lastActiveDate"::text AS "streakLastActiveDate",
         st."brokenAt" AS "streakBrokenAt",
         up."timezone",
         se."lastSeenAt",
         ua."etag" AS "avatarVersion"
    FROM "user" u
    LEFT JOIN "billing_account" ba ON ba."userId" = u."id"
    LEFT JOIN "user_subscription" us ON us."userId" = u."id"
    LEFT JOIN "programme_enrolment" pe
           ON pe."userId" = u."id" AND pe."status" = 'active'
    LEFT JOIN "programme" pr ON pr."slug" = pe."programmeSlug"
    LEFT JOIN "user_streak" st ON st."userId" = u."id"
    LEFT JOIN "user_profile" up ON up."userId" = u."id"
    -- The version only; the bytes are served by the avatar endpoint.
    LEFT JOIN "user_avatar" ua ON ua."userId" = u."id"
    LEFT JOIN LATERAL (
      SELECT max(s."updatedAt") AS "lastSeenAt"
        FROM "session" s
       WHERE s."userId" = u."id"
    ) se ON true
`;

const PAGE_SQL = `
  ${ROW_SQL}
   WHERE ${SEARCH_PREDICATE}
   ORDER BY u."createdAt" DESC, u."id" DESC
   LIMIT $2 OFFSET $3
`;

// The same row the list shows, for one user: the single-user view's header
// reads exactly what the list row it was opened from read.
const ONE_SQL = `
  ${ROW_SQL}
   WHERE u."id" = $1
`;

export interface AdminUserListPage {
  users: AdminUserListRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string | null;
}

@Injectable()
export class AdminUsersService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: AdminUsersQuery, now = new Date()): Promise<AdminUserListPage> {
    const pattern = query.q ? containsPattern(query.q) : null;
    const offset = (query.page - 1) * query.pageSize;

    const [countResult, pageResult] = await Promise.all([
      this.dataSource.query(COUNT_SQL, [pattern]),
      this.dataSource.query(PAGE_SQL, [pattern, query.pageSize, offset]),
    ]);
    const [{ total }] = returnedRows<{ total: number }>(countResult);

    return {
      users: returnedRows<AdminUserListRecord>(pageResult).map((record) =>
        toAdminUserListRow(record, now),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
      query: query.q ?? null,
    };
  }

  async findOne(id: string, now = new Date()): Promise<AdminUserListRow> {
    const [record] = returnedRows<AdminUserListRecord>(
      await this.dataSource.query(ONE_SQL, [id]),
    );

    if (!record) {
      throw new NotFoundException({
        code: "ADMIN_USER_NOT_FOUND",
        message: "No user with that id.",
      });
    }

    return toAdminUserListRow(record, now);
  }
}

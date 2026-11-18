import { cache } from "react";
import { z } from "zod";
import { adminServerGet } from "@/lib/admin/admin-api";
import { engineActivityQuery, type FiringFilters } from "@/lib/admin/engine-activity-search";

const firingRowSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleName: z.string().nullable(),
  userId: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  eventName: z.string().nullable(),
  firedAt: z.string(),
});

const firingFiltersSchema = z.object({
  ruleId: z.string().nullable(),
  eventName: z.string().nullable(),
});

const firingLogSchema = z.object({
  firings: z.array(firingRowSchema),
  limit: z.number().int(),
  filters: firingFiltersSchema,
  options: z.object({
    rules: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
    events: z.array(z.string()),
  }),
});

const ruleSummaryRowSchema = z.object({
  ruleId: z.string(),
  name: z.string().nullable(),
  triggerEvent: z.string().nullable(),
  active: z.boolean().nullable(),
  firings: z.number().int().nonnegative(),
  lastFiredAt: z.string().nullable(),
});

const ruleActivitySchema = z.object({
  rules: z.array(ruleSummaryRowSchema),
  daily: z.array(z.object({ day: z.string(), firings: z.number().int().nonnegative() })),
});

const cooldownStatusSchema = z.enum(["queued", "released", "suppressed"]);

const cooldownRowSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string().nullable(),
  userEmail: z.string().nullable(),
  badgeId: z.string(),
  badgeName: z.string().nullable(),
  status: cooldownStatusSchema,
  enqueuedAt: z.string(),
  releasedAt: z.string().nullable(),
});

const cooldownLogSchema = z.object({
  counts: z.record(cooldownStatusSchema, z.number().int().nonnegative()),
  entries: z.array(cooldownRowSchema),
  limit: z.number().int(),
});

export type FiringLog = z.infer<typeof firingLogSchema>;
export type FiringRow = z.infer<typeof firingRowSchema>;
export type RuleSummaryRow = z.infer<typeof ruleSummaryRowSchema>;
export type DailyFirings = z.infer<typeof ruleActivitySchema>["daily"];
export type CooldownStatus = z.infer<typeof cooldownStatusSchema>;
export type CooldownRow = z.infer<typeof cooldownRowSchema>;

export function getEngineFirings(filters: FiringFilters) {
  return adminServerGet(
    `/admin/engine-activity/firings${engineActivityQuery(filters)}`,
    firingLogSchema,
  );
}

/** Shared by the trend chart and the rule list: one request per render. */
export const getEngineRuleActivity = cache(() =>
  adminServerGet("/admin/engine-activity/rules", ruleActivitySchema),
);

export function getBadgeCooldownLog() {
  return adminServerGet("/admin/engine-activity/cooldown", cooldownLogSchema);
}

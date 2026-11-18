import { Injectable } from "@nestjs/common";
import { InjectEntityManager } from "@nestjs/typeorm";
import { EntityManager } from "typeorm";
import type { EventName } from "@contentual/content-engine-vocabulary";
import {
  parseRuntimeEngineRule,
  type RuntimeEngineRule,
  type RuntimeRuleParseResult,
} from "./engine-rule";
import { returnedRows } from "./returned-rows";

export type InvalidRule = Extract<RuntimeRuleParseResult, { valid: false }>;

export interface SelectedRules {
  readonly valid: readonly RuntimeEngineRule[];
  readonly invalid: readonly InvalidRule[];
}

// `engine_rules` is a CMS-owned mirror: the API credential holds SELECT on it
// and nothing more. Ordering by "sourceDocumentId" is what makes an evaluation
// run deterministic — without it Postgres may return rules in any order, and a
// replayed event could reserve firings in a different sequence than the first
// run did.
const ACTIVE_BY_TRIGGER_SQL = `
  SELECT "sourceDocumentId", "key", "triggerEvent", "conditions",
         "effectType", "effectParams", "dedupeScope", "priority"
  FROM "engine_rules"
  WHERE "active" = true AND "triggerEvent" = $1
  ORDER BY "sourceDocumentId" ASC
`;

// The active flag is selected rather than filtered on, so "no such rule" and
// "that rule is switched off" stay distinguishable — an operator who names a
// rule deserves to be told which of the two happened, not handed one empty
// result for both.
const BY_ID_SQL = `
  SELECT "sourceDocumentId", "key", "triggerEvent", "conditions",
         "effectType", "effectParams", "dedupeScope", "priority", "active"
  FROM "engine_rules"
  WHERE "sourceDocumentId" = $1
`;

export type RuleLookup =
  | { readonly found: false }
  | { readonly found: true; readonly active: false }
  | {
      readonly found: true;
      readonly active: true;
      readonly parsed: RuntimeRuleParseResult;
    };

/**
 * Reads the active rules listening for one event.
 *
 * There is deliberately no `engine_rules` entity. An entity would advertise a
 * repository with save/delete on a table this service must never write, and
 * TypeORM's schema tooling would then treat a CMS-owned table as ours to
 * migrate. Raw parameterised SELECT keeps the read-only boundary visible.
 */
@Injectable()
export class EngineRuleRepository {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async findActiveByTrigger(eventName: EventName): Promise<SelectedRules> {
    const rows = returnedRows<unknown>(
      await this.entityManager.query(ACTIVE_BY_TRIGGER_SQL, [eventName]),
    );

    const valid: RuntimeEngineRule[] = [];
    const invalid: InvalidRule[] = [];

    // Parsed here rather than in the evaluator so a malformed row is separated
    // from usable ones at the boundary it entered through.
    for (const row of rows) {
      const parsed = parseRuntimeEngineRule(row);

      if (parsed.valid) {
        valid.push(parsed.rule);
      } else {
        invalid.push(parsed);
      }
    }

    return { valid, invalid };
  }

  // Used by the on-demand backfill, which is told a rule rather than an event.
  async findById(sourceDocumentId: string): Promise<RuleLookup> {
    const [row] = returnedRows<Record<string, unknown>>(
      await this.entityManager.query(BY_ID_SQL, [sourceDocumentId]),
    );

    if (!row) {
      return { found: false };
    }

    if (row.active !== true) {
      return { found: true, active: false };
    }

    return { found: true, active: true, parsed: parseRuntimeEngineRule(row) };
  }
}

import type { EntityManager } from "typeorm";
import type { ProductEventName } from "../../observability/product-events";
import {
  PermanentEffectError,
  type EffectDispatchInput,
} from "../effect-dispatcher.port";
import { returnedRows } from "../returned-rows";

/**
 * The effect's target is not in the local mirror yet, or is not active.
 *
 * Deliberately *not* a PermanentEffectError. The rule mirror and the
 * programme/badge/call-type mirrors synchronise from the CMS independently, on
 * a job that drains about once a minute, so a rule can legitimately land in app
 * Postgres before the target it names. Treating that ordinary race as permanent
 * would acknowledge the event and lose the effect for good.
 *
 * Retrying costs a backed-off redelivery and resolves itself once the target's
 * mirror job lands. A target that never arrives — deleted, or unpublished on
 * purpose — retries until the event's backoff makes it cheap, which is the
 * right trade against silently dropping a badge.
 */
export class EffectTargetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EffectTargetUnavailableError";
  }
}

/**
 * The effect's target is mirrored, and switched off.
 *
 * Permanent, unlike an absent target. `active = false` is an authoritative
 * editorial decision that arrived through the mirror intact — the row is there,
 * it simply says no. Waiting for that to change would leave the event pending
 * until somebody happens to re-activate the badge, which may be never.
 *
 * The effect is not applied and the event is allowed to finish.
 */
export class EffectTargetInactiveError extends PermanentEffectError {
  constructor(message: string) {
    super(message);
    this.name = "EffectTargetInactiveError";
  }
}

/**
 * What a handler wants reported once its write is durable.
 *
 * Returned rather than captured in the handler itself, because a handler runs
 * inside the router's transaction: reporting from there would announce effects
 * that later rolled back. Only the handler knows *whether* something happened —
 * an already-held badge is a no-op — and only the router knows *when* it is
 * committed, so the fact travels from one to the other.
 */
export interface EffectWriteOutcome {
  readonly analytics: {
    readonly event: ProductEventName;
    readonly properties?: Record<string, unknown>;
  };
}

/**
 * One effect type's write.
 *
 * A handler receives a transaction manager rather than opening its own. The
 * dispatcher completes the firing ledger in that same transaction, so an effect
 * and its fired-mark commit together or not at all — the contract
 * FiringLedgerService describes. A handler that managed its own transaction
 * could commit an effect whose reservation was then refused, and the effect
 * would run twice.
 *
 * Returning an outcome is optional: most effects are internal bookkeeping with
 * no product moment to report.
 */
export interface ContentEngineEffectHandler {
  write(
    manager: EntityManager,
    input: EffectDispatchInput,
  ): Promise<EffectWriteOutcome | void>;
}

// Targets live in CMS-owned mirrors that synchronise independently of firings,
// so existence is checked at execution time rather than by a foreign key — and
// a failed check is a timing question, not an authoring one.
export async function assertTargetExists(
  manager: EntityManager,
  options: {
    table: string;
    sourceDocumentId: string;
    effectType: string;
    requireActive: boolean;
  },
): Promise<void> {
  // The active flag is selected rather than filtered on, because "no such row"
  // and "row says inactive" need different answers: the first is a mirror that
  // has not caught up, the second is an editorial decision. Filtering would
  // collapse them into one indistinguishable empty result.
  //
  // The programme mirror carries no active column, so existence is all there is
  // to check and the flag is selected as a constant.
  const activeColumn = options.requireActive ? `"active"` : `TRUE`;

  const rows = returnedRows<{ targetActive: boolean | null }>(
    await manager.query(
      `SELECT ${activeColumn} AS "targetActive" FROM "${options.table}"
        WHERE "sourceDocumentId" = $1`,
      [options.sourceDocumentId],
    ),
  );

  if (rows.length === 0) {
    throw new EffectTargetUnavailableError(
      `${options.effectType} target ${options.sourceDocumentId} is not yet a known ` +
        `${options.table} entry`,
    );
  }

  if (rows[0].targetActive !== true) {
    throw new EffectTargetInactiveError(
      `${options.effectType} target ${options.sourceDocumentId} is an inactive ` +
        `${options.table} entry`,
    );
  }
}

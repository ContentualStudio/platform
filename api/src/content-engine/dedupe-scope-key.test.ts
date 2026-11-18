import * as assert from "node:assert/strict";
import { test } from "node:test";
import { dedupeScopeTokens } from "@contentual/content-engine-vocabulary";
import { dedupeScopeKey, type FiringContext } from "./dedupe-scope-key";

function context(overrides: Partial<FiringContext> = {}): FiringContext {
  return {
    ruleId: "rule-1",
    userId: "user-1",
    dedupeScope: dedupeScopeTokens.oncePerUser,
    eventId: "event-1",
    ...overrides,
  };
}

test("once_per_user collapses every event onto one constant key", () => {
  const first = dedupeScopeKey(context({ eventId: "event-1" }));
  const second = dedupeScopeKey(context({ eventId: "event-2" }));

  assert.deepEqual(first, { ok: true, scopeKey: "user:*" });
  assert.deepEqual(second, first);
});

test("once_per_user_per_programme keys on the programme", () => {
  const result = dedupeScopeKey(
    context({
      dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme,
      programmeId: "programme-7",
    }),
  );

  assert.deepEqual(result, { ok: true, scopeKey: "programme:programme-7" });
});

test("once_per_user_per_programme separates programmes but not events", () => {
  const base = {
    dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme,
  } satisfies Partial<FiringContext>;

  const sameProgramme = [
    dedupeScopeKey(context({ ...base, programmeId: "p1", eventId: "e1" })),
    dedupeScopeKey(context({ ...base, programmeId: "p1", eventId: "e2" })),
  ];
  const otherProgramme = dedupeScopeKey(
    context({ ...base, programmeId: "p2", eventId: "e1" }),
  );

  assert.deepEqual(sameProgramme[0], sameProgramme[1]);
  assert.notDeepEqual(sameProgramme[0], otherProgramme);
});

test("every_time produces a distinct key per triggering event", () => {
  const first = dedupeScopeKey(
    context({ dedupeScope: dedupeScopeTokens.everyTime, eventId: "event-1" }),
  );
  const second = dedupeScopeKey(
    context({ dedupeScope: dedupeScopeTokens.everyTime, eventId: "event-2" }),
  );

  assert.deepEqual(first, { ok: true, scopeKey: "event:event-1" });
  assert.deepEqual(second, { ok: true, scopeKey: "event:event-2" });
});

// The namespace prefixes exist for exactly this case: without them a programme
// or event literally named "*" would alias the once_per_user reservation and
// silently suppress a legitimate firing.
test("an identifier of '*' never collides with the once_per_user key", () => {
  const perUser = dedupeScopeKey(context({ dedupeScope: dedupeScopeTokens.oncePerUser }));
  const perProgramme = dedupeScopeKey(
    context({ dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme, programmeId: "*" }),
  );
  const everyTime = dedupeScopeKey(
    context({ dedupeScope: dedupeScopeTokens.everyTime, eventId: "*" }),
  );

  assert.notDeepEqual(perProgramme, perUser);
  assert.notDeepEqual(everyTime, perUser);
  assert.notDeepEqual(everyTime, perProgramme);
});

test("a missing or blank programme id is reported, not thrown", () => {
  for (const programmeId of [undefined, null, "", "   "]) {
    assert.deepEqual(
      dedupeScopeKey(
        context({
          dedupeScope: dedupeScopeTokens.oncePerUserPerProgramme,
          programmeId,
        }),
      ),
      { ok: false, reason: "missing_programme_id" },
    );
  }
});

test("a blank event id is reported for every_time", () => {
  assert.deepEqual(
    dedupeScopeKey(context({ dedupeScope: dedupeScopeTokens.everyTime, eventId: "  " })),
    { ok: false, reason: "missing_event_id" },
  );
});

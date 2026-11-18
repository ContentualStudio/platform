import { Inject, Injectable } from "@nestjs/common";
import {
  evaluateMatchingSnapshot,
  type MatchingProfile,
  type PublishedMatchingSetup,
} from "@contentual/programme-matching-vocabulary";
import type { SqlQueryable } from "../../database/queryable";
import {
  PROGRAMME_MATCHING_READER,
  type ProgrammeMatchingReader,
} from "./programme-matching.repository";
import type { ProgrammeMatchResult } from "./programme-matching.types";

// The seam the challenge-setup service depends on.
//
// Matching is now two steps that stay separate on purpose: loading the one
// active published snapshot, and evaluating it. The load is the only thing
// that touches the database, and the evaluation is the shared pure primitive
// the CMS preview calls with a draft snapshot — which is what makes "preview
// shows what will happen" a property of the code rather than a promise.
//
// Nothing here knows a programme's name, slug, or eligibility rules. Those are
// content, and the only way this class can learn one is by reading a published
// setup.
@Injectable()
export class ProgrammeMatcher {
  constructor(
    @Inject(PROGRAMME_MATCHING_READER)
    private readonly setups: ProgrammeMatchingReader,
  ) {}

  // `queryable` is required by every caller that also writes: the setup must be
  // read inside the same transaction as the assignment, or the active pointer
  // can move between the decision and the record of it.
  async match(
    profile: MatchingProfile,
    queryable?: SqlQueryable,
  ): Promise<ProgrammeMatchResult> {
    const setup = await this.setups.loadActiveSetup(queryable);
    return matchAgainstSetup(profile, setup);
  }
}

// Exported for preview and for tests: the same evaluation against an explicitly
// supplied snapshot, with no database and no ambient active pointer.
export function matchAgainstSetup(
  profile: MatchingProfile,
  setup: PublishedMatchingSetup,
): ProgrammeMatchResult {
  return { profile, trace: evaluateMatchingSnapshot(profile, setup) };
}

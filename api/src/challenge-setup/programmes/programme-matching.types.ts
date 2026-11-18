import type {
  MatchingProfile,
  MatchingTrace,
} from "@contentual/programme-matching-vocabulary";

// What matching commits to.
//
// Deliberately just the two facts the assignment needs and nothing derived:
// the trace already names the selected programme, its version, the winning
// rule, the setup version and the fallback/overlap flags, so restating them
// alongside it would be two names for every matching fact, kept in step by
// hand. Callers read `trace.selected*`.
export interface ProgrammeMatchResult {
  // The structured answers the decision read — stored as the assignment's
  // evidence, and the reason free text cannot reach it.
  profile: MatchingProfile;
  trace: MatchingTrace;
}

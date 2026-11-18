import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import { ContentEventValidationError } from "./content-event";

// Stable event IDs, one builder per event. Every builder takes a named
// parameter object rather than positional arguments — a positional builder
// lets two same-typed segments (userId, programmeId) be silently transposed
// by the caller.
//
// `id` must be derived from values produced by the *same conditional write*
// that gates the emit (see docs/content-engine-events.md). Never build one
// from Date.now(), new Date(), randomUUID() or a DB now() — anything that
// could differ between a request and its retry defeats the whole point of a
// stable ID.

function segment(value: string | number): string {
  const text = String(value).trim();

  if (!text) {
    throw new ContentEventValidationError(
      "Event ID segment must not be empty.",
    );
  }

  // ":" is the separator between segments. An unescaped separator inside a
  // segment lets "p:1" + "2" alias "p" + "1:2" — two different facts claiming
  // the same event ID.
  if (text.includes(":")) {
    throw new ContentEventValidationError(
      `Event ID segment ${JSON.stringify(text)} must not contain ":".`,
    );
  }

  return text;
}

function buildId(token: string, ...segments: readonly (string | number)[]): string {
  return [token, ...segments.map(segment)].join(":");
}

export const contentEventIds = {
  taskCompleted: (args: {
    userId: string;
    assignmentId?: string;
    programmeId: string;
    taskId: string;
    localDate: string;
  }) =>
    buildId(
      eventNameTokens.taskCompleted,
      args.userId,
      args.programmeId,
      args.taskId,
      args.localDate,
      ...(args.assignmentId ? [args.assignmentId] : []),
    ),

  taskSkipped: (args: {
    userId: string;
    assignmentId?: string;
    programmeId: string;
    taskId: string;
    localDate: string;
  }) =>
    buildId(
      eventNameTokens.taskSkipped,
      args.userId,
      args.programmeId,
      args.taskId,
      args.localDate,
      ...(args.assignmentId ? [args.assignmentId] : []),
    ),

  programmeStarted: (args: {
    userId: string;
    programmeId: string;
    assignmentId?: string;
  }) =>
    buildId(
      eventNameTokens.programmeStarted,
      args.userId,
      args.programmeId,
      ...(args.assignmentId ? [args.assignmentId] : []),
    ),

  programmeCompleted: (args: {
    userId: string;
    programmeId: string;
    assignmentId?: string;
  }) =>
    buildId(
      eventNameTokens.programmeCompleted,
      args.userId,
      args.programmeId,
      ...(args.assignmentId ? [args.assignmentId] : []),
    ),

  programmeCountReached: (args: { userId: string; count: number }) =>
    buildId(eventNameTokens.programmeCountReached, args.userId, args.count),

  streakReached: (args: {
    userId: string;
    runOrdinal: number;
    streakLength: number;
  }) =>
    buildId(
      eventNameTokens.streakReached,
      args.userId,
      args.runOrdinal,
      args.streakLength,
    ),

  streakBroken: (args: { userId: string; runOrdinal: number }) =>
    buildId(eventNameTokens.streakBroken, args.userId, args.runOrdinal),

  // The new run's ordinal — a resumed streak is identified by the run it
  // starts, not the run that broke.
  streakResumed: (args: { userId: string; runOrdinal: number }) =>
    buildId(eventNameTokens.streakResumed, args.userId, args.runOrdinal),

  weekCompleted: (args: {
    userId: string;
    assignmentId?: string;
    programmeId: string;
    weekIndex: number;
  }) =>
    buildId(
      eventNameTokens.weekCompleted,
      args.userId,
      args.programmeId,
      args.weekIndex,
      ...(args.assignmentId ? [args.assignmentId] : []),
    ),

  levelChanged: (args: { userId: string; changeOrdinal: number }) =>
    buildId(eventNameTokens.levelChanged, args.userId, args.changeOrdinal),

  platformConnected: (args: {
    userId: string;
    platform: string;
    connectionOrdinal: number;
  }) =>
    buildId(
      eventNameTokens.platformConnected,
      args.userId,
      args.platform,
      args.connectionOrdinal,
    ),

  followerMilestone: (args: { userId: string; tier: number }) =>
    buildId(eventNameTokens.followerMilestone, args.userId, args.tier),

  // All three billing transitions are keyed by the Stripe event that
  // confirmed them. A Stripe event id is the stable identity of one fact:
  // Stripe redelivers the same id on retry, and two different events can
  // never describe the same transition because the transition is detected
  // against our stored state, which the first delivery already moved.
  subscriptionStarted: (args: { userId: string; stripeEventId: string }) =>
    buildId(
      eventNameTokens.subscriptionStarted,
      args.userId,
      args.stripeEventId,
    ),

  subscriptionChanged: (args: { userId: string; stripeEventId: string }) =>
    buildId(
      eventNameTokens.subscriptionChanged,
      args.userId,
      args.stripeEventId,
    ),

  subscriptionEnded: (args: { userId: string; stripeEventId: string }) =>
    buildId(eventNameTokens.subscriptionEnded, args.userId, args.stripeEventId),
} as const satisfies Record<keyof typeof eventNameTokens, (args: never) => string>;

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { tier, tierKeyOrFree } from "../billing/billing-tiers";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { eventNameTokens } from "@contentual/content-engine-vocabulary";
import type { MatchingProfile } from "@contentual/programme-matching-vocabulary";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { ContentEventBatch, dispatchAfterCommit } from "../content-engine/event-batch";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { ContentEventEmitter } from "../content-engine/event-emitter";
import { contentEventIds } from "../content-engine/event-ids";
import { UserProfileEntity } from "../profile/entities/user-profile.entity";
import { BetterAuthUserEntity } from "../auth/entities";
import { stage1AnswersSchema } from "../profile/profile.schemas";
import {
  stage2AnswersSchema,
  Stage2PartialAnswersInput,
} from "./challenge-setup.schemas";
import { ChallengeSetupEntity } from "./entities/challenge-setup.entity";
import type { Programme } from "./programmes/programme-content";
import {
  PROGRAMME_CONTENT_READER,
  type ProgrammeContentQueryable,
  type ProgrammeContentReader,
} from "./programmes/programme-content.repository";
import { scheduleDayOne } from "./programmes/schedule";
import { buildMatchingProfile } from "./programmes/matching-profile";
import { ProgrammeAssignmentRepository } from "./programmes/programme-assignment.repository";
import {
  assertProgrammeVersionEligible,
  lockProgrammeMatchingPublication,
} from "./programmes/programme-matching-publication-lock";
import { ProgrammeMatcher } from "./programmes/programme-matcher";
import { MatchingConfigurationError } from "./programmes/programme-matching.repository";
import type { ProgrammeMatchResult } from "./programmes/programme-matching.types";
import {
  MATCHING_ROLLOUT,
  MatchingRollout,
} from "./programmes/matching-rollout";
import { ProgrammeEnrolmentService } from "../programme-enrolment/programme-enrolment.service";
import {
  EligibleProgrammesService,
  type StartRefusal,
} from "../progression/eligible-programmes.service";
import { localDateFor } from "../common/timezone";

export interface ChallengeSetupStatus {
  setupCompleted: boolean;
  programmeAssignedAt: string | null;
  programmeStarted: boolean;
  day1ScheduledFor: string | null;
  programmeCompleted: boolean;
  assignedProgramme: Programme | null;
  answers: {
    platforms: string[] | null;
    primaryPlatform: string | null;
    postingGoal: string | null;
    weeklyCommitment: number | null;
    availableDays: string[] | null;
    sawTestimonial: boolean | null;
    nicheDefined: string | null;
    contentType: string | null;
    followerRange: string | null;
    instagramConnected: boolean | null;
    milestone: string | null;
  };
}

export interface RematchProgrammeInput {
  userId: string;
  actor: string;
  reason: string;
  attemptId: string;
}

export interface RematchProgrammeResult {
  status: ChallengeSetupStatus;
  created: boolean;
}

// The answer shape a user who has never opened the questionnaire has. Named
// once so `storedAnswers` can substitute it wholesale instead of coalescing
// ten fields individually — the columns are already nullable, so a present row
// needs no defaulting at all.
const NO_STORED_ANSWERS: ChallengeSetupStatus["answers"] = {
  platforms: null,
  primaryPlatform: null,
  postingGoal: null,
  weeklyCommitment: null,
  availableDays: null,
  sawTestimonial: null,
  nicheDefined: null,
  contentType: null,
  followerRange: null,
  instagramConnected: null,
  milestone: null,
};

// Echoes back the stored Stage 2 answers so a resumed session can rehydrate the
// questionnaire.
function storedAnswers(
  setup: ChallengeSetupEntity | null,
): ChallengeSetupStatus["answers"] {
  if (!setup) {
    return NO_STORED_ANSWERS;
  }

  return {
    platforms: setup.platforms,
    primaryPlatform: setup.primaryPlatform ?? null,
    postingGoal: setup.postingGoal,
    weeklyCommitment: setup.weeklyCommitment,
    availableDays: setup.availableDays,
    sawTestimonial: setup.sawTestimonial,
    nicheDefined: setup.nicheDefined,
    contentType: setup.contentType,
    followerRange: setup.followerRange,
    instagramConnected: setup.instagramConnected,
    milestone: setup.milestone,
  };
}

function toIsoString(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function normalizeRematchInput(
  input: RematchProgrammeInput,
): RematchProgrammeInput {
  const normalized = {
    userId: input.userId.trim(),
    actor: input.actor.trim(),
    reason: input.reason.trim(),
    attemptId: input.attemptId.trim(),
  };

  if (Object.values(normalized).some((value) => value.length === 0)) {
    throw new BadRequestException({
      code: "INVALID_REMATCH_REQUEST",
      message: "A user, actor, reason and attempt id are required.",
    });
  }

  return normalized;
}

export type ProgrammeStartState =
  | "startable"
  | "active"
  | "another_active"
  | "setup_incomplete"
  | StartRefusal;

export interface ProgrammeWelcome {
  readonly programme: Programme;
  readonly start: ProgrammeStartState;
}

function programmeNotAvailable() {
  return new NotFoundException({
    code: "PROGRAMME_NOT_AVAILABLE",
    message: "That programme isn't available to start.",
  });
}

@Injectable()
export class ChallengeSetupService {
  private readonly logger = new Logger(ChallengeSetupService.name);
  private readonly rollout: MatchingRollout;

  constructor(
    @InjectRepository(ChallengeSetupEntity)
    private readonly setupRepository: Repository<ChallengeSetupEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly profileRepository: Repository<UserProfileEntity>,
    private readonly matcher: ProgrammeMatcher,
    private readonly assignments: ProgrammeAssignmentRepository,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: ContentEventEmitter,
    private readonly eventDispatcher: ContentEventDispatcher,
    @Inject(PROGRAMME_CONTENT_READER)
    private readonly contentReader: ProgrammeContentReader,
    private readonly enrolments: ProgrammeEnrolmentService,
    private readonly eligibility: EligibleProgrammesService,
    @Optional()
    @Inject(MATCHING_ROLLOUT)
    rollout?: MatchingRollout,
  ) {
    this.rollout = rollout ?? new MatchingRollout();
  }

  async getStatus(user: AuthenticatedUser): Promise<ChallengeSetupStatus> {
    const setup = await this.setupRepository.findOneBy({ userId: user.id });
    return this.toStatus(setup);
  }

  // Completion is the only moment matching runs, and it runs exactly once per
  // user. Everything it depends on — the locked setup row, the profile, the
  // published-content check and the write — happens inside one transaction, so
  // there is no window in which a user is "completed" without an assignment,
  // or assigned to a programme whose content does not exist.
  async completeStage2(user: AuthenticatedUser): Promise<ChallengeSetupStatus> {
    const setup = await this.dataSource.transaction((manager) =>
      this.assignProgramme(manager, user),
    );

    return this.toStatus(setup);
  }

  /**
   * Re-derives one user's assignment under an explicit operator attempt. The
   * setup lock, matcher read, active-row close, replacement insert and setup
   * update share one transaction; a failed match therefore leaves the old
   * assignment and journey untouched.
   */
  async rematchProgramme(
    input: RematchProgrammeInput,
  ): Promise<RematchProgrammeResult> {
    const result = await this.dataSource.transaction((manager) =>
      this.rematchInTransaction(manager, input),
    );

    return {
      status: await this.toStatus(result.setup),
      created: result.created,
    };
  }

  private async rematchInTransaction(
    manager: EntityManager,
    input: RematchProgrammeInput,
  ): Promise<{ setup: ChallengeSetupEntity; created: boolean }> {
    const request = normalizeRematchInput(input);

    const setup = await manager.findOne(ChallengeSetupEntity, {
      where: { userId: request.userId },
      lock: { mode: "pessimistic_write" },
    });

    if (!setup?.assignedProgrammeId) {
      throw new NotFoundException({
        code: "NO_ASSIGNED_PROGRAMME",
        message: "The user has no programme to rematch.",
      });
    }

    const existing = await this.assignments.findByAttempt(
      manager,
      request.userId,
      request.attemptId,
    );

    if (existing) {
      return { setup, created: false };
    }

    const profile = await manager.findOneBy(UserProfileEntity, {
      userId: request.userId,
    });

    if (!profile) {
      throw this.incompleteStage1Error();
    }

    const account = await manager.findOneBy(BetterAuthUserEntity, {
      id: request.userId,
    });

    if (!account) {
      throw this.incompleteStage1Error();
    }

    const matchingProfile = this.readMatchingProfile(
      {
        id: request.userId,
        email: account.email,
        image: account.image,
        name: account.name,
        onboardingCompleted: true,
      },
      profile,
      setup,
    );
    await lockProgrammeMatchingPublication(manager);
    const result = await this.runMatching(
      request.userId,
      matchingProfile,
      manager,
    );

    await this.requirePublished(result, manager);

    const matchedAt = new Date();
    const replacement = await this.assignments.rematch(manager, {
      userId: request.userId,
      matchedAt,
      result,
      actor: request.actor,
      reason: request.reason,
      attemptId: request.attemptId,
      supersededAt: matchedAt,
    });

    if (!replacement.created) {
      return { setup, created: false };
    }

    setup.assignedProgrammeId = result.trace.selectedProgrammeKey;
    setup.assignedProgrammeVersionId = result.trace.selectedProgrammeVersionId;
    setup.assignedProgrammeAssignmentId = replacement.assignment.id;
    setup.programmeAssignedAt = matchedAt;
    setup.matchAlgorithmVersion = result.trace.setupVersionId;
    setup.matchLeafId = result.trace.selectedRuleId;
    setup.programmeStartedAt = null;
    setup.day1ScheduledFor = null;
    setup.programmeCompletedAt = null;

    await this.enrolments.abandonActiveInTransaction(
      manager,
      request.userId,
      matchedAt,
    );

    return { setup: await manager.save(setup), created: true };
  }

  private async assignProgramme(
    manager: EntityManager,
    user: AuthenticatedUser,
  ): Promise<ChallengeSetupEntity> {
    // The lock is taken before the completion check, not after: two concurrent
    // submissions must not both read "not yet completed" and both match.
    const setup = await manager.findOne(ChallengeSetupEntity, {
      where: { userId: user.id },
      lock: { mode: "pessimistic_write" },
    });

    if (setup?.setupCompletedAt && setup.assignedProgrammeId) {
      // The initial assignment is immutable. It is deliberately *not* compared
      // against the current configuration — a tree released since then would
      // otherwise silently rewrite a user's programme.
      return setup;
    }

    const profile = await manager.findOneBy(UserProfileEntity, {
      userId: user.id,
    });

    if (!profile) {
      throw this.incompleteStage1Error();
    }

    if (!setup) {
      throw this.incompleteStage2Error();
    }

    const matchingProfile = this.readMatchingProfile(user, profile, setup);
    await lockProgrammeMatchingPublication(manager);
    const result = await this.runMatching(user.id, matchingProfile, manager);

    // Reads through the transaction's manager so the availability check and the
    // assignment observe the same snapshot.
    await this.requirePublished(result, manager);

    const completedAt = new Date();

    // A dev reset can clear challenge_setup while an active assignment row
    // remains. Supersede it before inserting so the one-active-per-user index
    // and the per-attempt uniqueness both stay satisfied.
    await this.assignments.supersedeActiveIfPresent(manager, {
      userId: user.id,
      supersededAt: completedAt,
      actor: `user:${user.id}`,
      reason: "superseded by questionnaire completion",
    });

    const attemptId = await this.assignments.resolveInitialAttemptId(
      manager,
      user.id,
    );

    // The assignment row is written before the completion flag, inside the same
    // transaction. Its partial unique index on active rows is what makes two
    // concurrent completions resolve to one assignment: the loser raises here
    // and rolls back with no completion state written at all.
    const assignment = await this.assignments.record(manager, {
      userId: user.id,
      matchedAt: completedAt,
      result,
      attemptId,
      attemptActor: `user:${user.id}`,
      attemptReason: "initial onboarding assignment",
    });

    setup.setupCompletedAt = completedAt;
    setup.assignedProgrammeId = result.trace.selectedProgrammeKey;
    setup.assignedProgrammeVersionId = result.trace.selectedProgrammeVersionId;
    setup.assignedProgrammeAssignmentId = assignment.id;
    setup.programmeAssignedAt = completedAt;
    // Transitional, and deliberately still written even though nothing reads
    // these two columns any more: they are the pre-CMS audit trail, and keeping
    // them populated means a rollback to the previous release finds the values
    // it expects rather than nulls. They now carry the published setup version
    // and the winning rule, and they are dropped once the cutover is settled.
    setup.matchAlgorithmVersion = result.trace.setupVersionId;
    setup.matchLeafId = result.trace.selectedRuleId;

    return manager.save(setup);
  }

  // Both stages are re-validated from storage before matching. The database
  // columns are all nullable — a half-finished or since-emptied answer set must
  // never reach the evaluator as a silently widened `string | null`.
  private readMatchingProfile(
    user: AuthenticatedUser,
    profile: UserProfileEntity,
    setup: ChallengeSetupEntity,
  ): MatchingProfile {
    const stage1 = stage1AnswersSchema.safeParse({
      // Stage 1 persists the name on the account, not the profile row.
      name: user.name,
      userType: profile.userType,
      region: profile.region,
      timezone: profile.timezone,
      platforms: profile.platforms,
      experienceLevel: profile.experienceLevel,
      postingFrequency: profile.postingFrequency,
      mainGoal: profile.mainGoal,
      biggestChallenge: profile.biggestChallenge,
    });

    if (!stage1.success) {
      throw this.incompleteStage1Error();
    }

    const stage2 = stage2AnswersSchema.safeParse({
      platforms: setup.platforms,
      primaryPlatform: setup.primaryPlatform ?? null,
      postingGoal: setup.postingGoal,
      weeklyCommitment: setup.weeklyCommitment,
      availableDays: setup.availableDays,
      sawTestimonial: setup.sawTestimonial ?? false,
      nicheDefined: setup.nicheDefined,
      contentType: setup.contentType,
      followerRange: setup.followerRange,
      instagramConnected: setup.instagramConnected ?? false,
      milestone: setup.milestone ?? "",
    });

    if (!stage2.success) {
      throw this.incompleteStage2Error();
    }

    const matching = buildMatchingProfile({
      stage1: stage1.data,
      stage2: stage2.data,
      primaryPlatform: stage2.data.primaryPlatform,
    });

    if (!matching.valid) {
      throw this.incompleteStage2Error();
    }

    return matching.profile;
  }

  // A missing or unusable published setup is a configuration failure, not
  // something the user did. It surfaces as a 500 and, crucially, aborts the
  // transaction: the alternative — completing onboarding and assigning nobody —
  // is the one state this flow must never produce.
  private async runMatching(
    userId: string,
    profile: MatchingProfile,
    manager: EntityManager,
  ): Promise<ProgrammeMatchResult> {
    try {
      return await this.rollout.evaluate(
        userId,
        profile,
        manager,
        () => this.matcher.match(profile, manager),
      );
    } catch (error) {
      if (!(error instanceof MatchingConfigurationError)) {
        throw error;
      }

      this.logger.error(
        `Programme matching is unavailable: reasonCode=${error.reasonCode} setupVersionId=${error.setupVersionId ?? "none"} ${error.message}`,
      );

      throw new InternalServerErrorException({
        code: "MATCHING_UNAVAILABLE",
        message: "Programme matching is temporarily unavailable.",
      });
    }
  }

  // A step is saved on its own so an abandoned session keeps its progress.
  // Partial saves never complete Stage 2 or invoke matching; that only happens
  // through the explicit final submission endpoint.
  async saveStage2Answers(
    user: AuthenticatedUser,
    input: Stage2PartialAnswersInput,
  ): Promise<ChallengeSetupStatus> {
    if (Object.keys(input).length === 0) {
      // Nothing to write, so nothing to serialize against: an empty save is a
      // status read.
      return this.toStatus(
        await this.setupRepository.findOneBy({ userId: user.id }),
      );
    }

    const setup = await this.dataSource.transaction((manager) =>
      this.writeStage2Answers(manager, user, input),
    );

    return this.toStatus(setup);
  }

  // Takes the same row lock completion takes, for the same reason. Checking
  // `setupCompletedAt` and then writing as two unsynchronized statements would
  // leave a window where a completion commits in between, and the write lands
  // on answers that an immutable assignment was already derived from.
  private async writeStage2Answers(
    manager: EntityManager,
    user: AuthenticatedUser,
    input: Stage2PartialAnswersInput,
  ): Promise<ChallengeSetupEntity | null> {
    const locked = await manager.findOne(ChallengeSetupEntity, {
      where: { userId: user.id },
      lock: { mode: "pessimistic_write" },
    });

    if (locked?.setupCompletedAt) {
      throw new ConflictException({
        code: "SETUP_ALREADY_COMPLETED",
        message: "Setup is already complete and can no longer be changed.",
      });
    }

    // No row yet means no assignment can exist either — completion refuses a
    // missing setup — so the first save is free to insert.
    await manager.upsert(
      ChallengeSetupEntity,
      { userId: user.id, ...input },
      ["userId"],
    );

    return manager.findOneBy(ChallengeSetupEntity, { userId: user.id });
  }

  // Assignments resolve the Welcome content by immutable publication id. The
  // cutover migration rejects any assigned row that cannot be pinned, so a
  // missing version is an unavailable journey rather than an invitation to
  // follow today's mutable slug.
  async getWelcomeContent(user: AuthenticatedUser): Promise<Programme> {
    const setup = await this.setupRepository.findOneBy({ userId: user.id });
    const programme = setup?.assignedProgrammeVersionId
      ? await this.findProgrammeVersion(setup.assignedProgrammeVersionId)
      : undefined;

    if (!programme) {
      throw new NotFoundException({
        code: "NO_ASSIGNED_PROGRAMME",
        message: "No programme has been assigned yet.",
      });
    }

    return programme;
  }

  // "Begin Programme" — idempotent. The first call records the start, anchors
  // Day 1 to the user's next local day and unlocks task access; repeat calls
  // (double-tap, ret). return the same already-started status without starting
  // a second time or rescheduling Day 1.
  //
  // The start is also the Content Engine's `programme.started` source of truth,
  // so the fact and its event are written in one transaction: an event can
  // never describe a start that rolled back, and a start can never commit
  // without its event. Delivery to the evaluator happens after that transaction
  // resolves — see below.
  async beginProgramme(user: AuthenticatedUser): Promise<ChallengeSetupStatus> {
    const batch = new ContentEventBatch();
    const setup = await this.dataSource.transaction((manager) =>
      this.startProgramme(manager, user, batch),
    );

    // The programme genuinely started (or already had) and its events are
    // durably stored; a dispatch failure here is logged and swallowed rather
    // than failing the request, which would misreport a committed fact.
    await dispatchAfterCommit(this.eventDispatcher, this.logger, batch.eventIds);

    return this.toStatus(setup);
  }

  private async assertStartAllowed(
    manager: EntityManager,
    userId: string,
    programme: Programme,
  ): Promise<void> {
    const refusal = await this.eligibility.startRefusal(userId, programme, manager);

    if (refusal === "locked") {
      throw new ForbiddenException({
        code: "PROGRAMME_LOCKED",
        message: "This programme hasn't been unlocked for you yet.",
      });
    }

    if (refusal === "requires_upgrade") {
      const plan = tier(tierKeyOrFree(programme.minimumTier)).displayName;

      throw new ForbiddenException({
        code: "PROGRAMME_REQUIRES_UPGRADE",
        message: `This programme is part of the ${plan} plan. Upgrade to start it.`,
      });
    }
  }

  /**
   * Welcome content for one programme, plus whether this user can start it.
   * The matched programme reads its exact assigned version; any other reads
   * the programme currently offered for enrolment.
   */
  async getProgrammeWelcome(
    user: AuthenticatedUser,
    slug: string,
  ): Promise<ProgrammeWelcome> {
    const [setup, active] = await Promise.all([
      this.setupRepository.findOneBy({ userId: user.id }),
      this.enrolments.findActiveForUser(user.id),
    ]);
    const programme =
      setup?.assignedProgrammeId === slug && setup.assignedProgrammeVersionId
        ? await this.findProgrammeVersion(setup.assignedProgrammeVersionId)
        : await this.eligibility.findOffered(slug);

    if (!programme) {
      throw programmeNotAvailable();
    }

    if (active) {
      return { programme, start: active.programmeSlug === slug ? "active" : "another_active" };
    }

    if (!setup?.setupCompletedAt) {
      return { programme, start: "setup_incomplete" };
    }

    return {
      programme,
      start: (await this.eligibility.startRefusal(user.id, programme)) ?? "startable",
    };
  }

  /**
   * Starts the programme named by slug. One journey at a time: starting the
   * running programme again is a no-op, and a different one is refused until
   * the current one ends. The matched programme, before its first start,
   * goes through the assignment-backed path so its exact version is used.
   */
  async startProgrammeBySlug(
    user: AuthenticatedUser,
    slug: string,
  ): Promise<ChallengeSetupStatus> {
    const batch = new ContentEventBatch();
    const setup = await this.dataSource.transaction((manager) =>
      this.startBySlugInTransaction(manager, user, slug, batch),
    );

    await dispatchAfterCommit(this.eventDispatcher, this.logger, batch.eventIds);

    return this.toStatus(setup);
  }

  private async startBySlugInTransaction(
    manager: EntityManager,
    user: AuthenticatedUser,
    slug: string,
    batch: ContentEventBatch,
  ): Promise<ChallengeSetupEntity | null> {
    // The setup row lock serialises this user's starts.
    const setup = await manager.findOne(ChallengeSetupEntity, {
      where: { userId: user.id },
      lock: { mode: "pessimistic_write" },
    });

    if (!setup?.setupCompletedAt) {
      throw new ConflictException({
        code: "SETUP_INCOMPLETE",
        message: "Finish the setup questionnaire before starting a programme.",
      });
    }

    if (setup.assignedProgrammeId === slug && !setup.programmeStartedAt) {
      return this.startProgramme(manager, user, batch);
    }

    if (await this.isRunning(manager, user.id, slug)) {
      return setup;
    }

    const programme = await this.eligibility.findOffered(slug, manager);

    if (!programme) {
      throw programmeNotAvailable();
    }

    await this.assertStartAllowed(manager, user.id, programme);
    await this.openJourney(manager, user, setup, programme, batch);

    return setup;
  }

  /** True when `slug` is already running; refuses when a different programme is. */
  private async isRunning(
    manager: EntityManager,
    userId: string,
    slug: string,
  ): Promise<boolean> {
    const active = await this.enrolments.findActiveForUpdate(manager, userId);

    if (active && active.programmeSlug !== slug) {
      throw new ConflictException({
        code: "PROGRAMME_ALREADY_ACTIVE",
        message: "Finish your current programme before starting another.",
      });
    }

    return Boolean(active);
  }

  /** Opens an assignment-less journey for an offered programme. */
  private async openJourney(
    manager: EntityManager,
    user: AuthenticatedUser,
    setup: ChallengeSetupEntity,
    programme: Programme,
    batch: ContentEventBatch,
  ): Promise<void> {
    const profile = await manager.findOneBy(UserProfileEntity, { userId: user.id });
    const timezone = profile?.timezone ?? "UTC";
    const now = new Date();
    const day1 = scheduleDayOne(now, timezone);

    const enrolment = await this.enrolments.startInTransaction(manager, {
      userId: user.id,
      programmeSlug: programme.id,
      programmeVersionId: null,
      assignmentId: null,
      startedAt: now,
      day1ScheduledFor: localDateFor(day1, timezone),
      durationDays: programme.durationDays,
    });

    // A first journey that isn't the matched programme still marks setup as
    // started, so onboarding gates treat the user as under way.
    if (!setup.programmeStartedAt) {
      await manager.update(
        ChallengeSetupEntity,
        { userId: user.id },
        { programmeStartedAt: now, day1ScheduledFor: day1 },
      );
      setup.programmeStartedAt = now;
      setup.day1ScheduledFor = day1;
    }

    // Keyed by the enrolment, so starting the same programme again after
    // finishing it is a new fact rather than a deduplicated repeat.
    const event = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.programmeStarted({
        userId: user.id,
        programmeId: programme.id,
        assignmentId: enrolment.id,
      }),
      eventName: eventNameTokens.programmeStarted,
      payload: { userId: user.id, programmeId: programme.id },
    });
    batch.add(event.id);
  }



  // Runs entirely inside the caller's transaction. Every read and write uses
  // the transaction's manager, including the event emit — a repository bound to
  // the default connection would write outside the transaction and break the
  // all-or-nothing guarantee.
  private async startProgramme(
    manager: EntityManager,
    user: AuthenticatedUser,
    batch: ContentEventBatch,
  ): Promise<ChallengeSetupEntity | null> {
    const setup = await manager.findOne(ChallengeSetupEntity, {
      where: { userId: user.id },
      lock: { mode: "pessimistic_write" },
    });

    if (!setup?.assignedProgrammeId) {
      throw new NotFoundException({
        code: "NO_ASSIGNED_PROGRAMME",
        message: "Finish the setup questionnaire before beginning.",
      });
    }

    const programme = await this.findAssignedProgramme(setup, manager);
    if (!programme) {
      throw new NotFoundException({
        code: "PROGRAMME_CONTENT_UNAVAILABLE",
        message: "The assigned programme is not currently published.",
      });
    }

    if (setup.programmeStartedAt) {
      return setup;
    }

    // Only a new start is gated: a running programme survives a downgrade.
    await this.assertStartAllowed(manager, user.id, programme);

    const profile = await manager.findOneBy(UserProfileEntity, {
      userId: user.id,
    });
    const timezone = profile?.timezone ?? "UTC";
    const now = new Date();
    const day1 = scheduleDayOne(now, timezone);
    const day1LocalDate = localDateFor(day1, timezone);

    // Conditional write guards the idempotency race: a concurrent second
    // request finds programmeStartedAt already set and updates nothing.
    const result = await manager
      .createQueryBuilder()
      .update(ChallengeSetupEntity)
      .set({ programmeStartedAt: now, day1ScheduledFor: day1 })
      .where("userId = :userId", { userId: user.id })
      .andWhere("programmeStartedAt IS NULL")
      .execute();

    if (result.affected === 0) {
      // Lost the race — return whatever the winner committed. The winner emits
      // the event; emitting here too would double-count the same start.
      return manager.findOneBy(ChallengeSetupEntity, { userId: user.id });
    }

    await this.enrolments.startInTransaction(manager, {
      userId: user.id,
      programmeSlug: setup.assignedProgrammeId,
      programmeVersionId: setup.assignedProgrammeVersionId,
      assignmentId: setup.assignedProgrammeAssignmentId,
      startedAt: now,
      day1ScheduledFor: day1LocalDate,
      durationDays: programme.durationDays,
    });

    // Derived from the fact, not generated: a retried request produces the same
    // ID and the outbox insert becomes a no-op instead of a second event.
    const event = await this.eventEmitter.emit(manager, {
      eventId: contentEventIds.programmeStarted({
        userId: user.id,
        programmeId: setup.assignedProgrammeId,
        assignmentId: setup.assignedProgrammeAssignmentId ?? undefined,
      }),
      eventName: eventNameTokens.programmeStarted,
      payload: {
        userId: user.id,
        programmeId: setup.assignedProgrammeId,
      },
    });
    batch.add(event.id);

    setup.programmeStartedAt = now;
    setup.day1ScheduledFor = day1;
    return setup;
  }

  private async toStatus(
    setup: ChallengeSetupEntity | null,
  ): Promise<ChallengeSetupStatus> {
    if (!setup) {
      return {
        setupCompleted: false,
        programmeAssignedAt: null,
        programmeStarted: false,
        day1ScheduledFor: null,
        programmeCompleted: false,
        assignedProgramme: null,
        answers: NO_STORED_ANSWERS,
      };
    }

    const programme = setup.assignedProgrammeVersionId
      ? ((await this.findProgrammeVersion(setup.assignedProgrammeVersionId)) ??
        null)
      : null;

    return {
      setupCompleted: Boolean(setup.setupCompletedAt),
      programmeAssignedAt: toIsoString(setup.programmeAssignedAt),
      programmeStarted: Boolean(setup.programmeStartedAt),
      day1ScheduledFor: toIsoString(setup.day1ScheduledFor),
      programmeCompleted: Boolean(setup.programmeCompletedAt),
      assignedProgramme: programme,
      answers: storedAnswers(setup),
    };
  }

  // A rule targeting a programme with no published mirror row is a content
  // defect, never a user-facing condition: the user answered everything
  // correctly. Failing here — before any completion state is written — is what
  // keeps a stored assignment a promise the app can actually keep.
  private async requirePublished(
    result: ProgrammeMatchResult,
    // Required, not optional: omitting it would silently read outside the
    // caller's transaction.
    queryable: ProgrammeContentQueryable,
  ): Promise<void> {
    const { trace } = result;
    if (trace.selectedProgrammeVersionId) {
      await assertProgrammeVersionEligible(
        queryable,
        trace.selectedProgrammeVersionId,
      );
    }
    const published = trace.selectedProgrammeVersionId
      ? await this.contentReader.findProgrammeVersion(
          trace.selectedProgrammeVersionId,
          queryable,
        )
      : undefined;

    if (published) {
      return;
    }

    this.logger.error(
      `Matched programme is not published: programmeKey=${trace.selectedProgrammeKey} programmeVersionId=${trace.selectedProgrammeVersionId} setupVersionId=${trace.setupVersionId} ruleId=${trace.selectedRuleId}`,
    );

    throw new InternalServerErrorException({
      code: "PROGRAMME_CONTENT_UNAVAILABLE",
      message: "The assigned programme is not available.",
    });
  }

  private incompleteStage1Error() {
    return new BadRequestException({
      code: "INCOMPLETE_STAGE1",
      message: "Finish your profile before matching.",
    });
  }

  private incompleteStage2Error() {
    return new BadRequestException({
      code: "INCOMPLETE_STAGE2",
      message: "Answer every required Stage 2 question before matching.",
    });
  }

  private async findProgrammeVersion(
    programmeVersionId: string,
    queryable?: ProgrammeContentQueryable,
  ): Promise<Programme | undefined> {
    return this.contentReader.findProgrammeVersion(programmeVersionId, queryable);
  }

  private async findAssignedProgramme(
    setup: ChallengeSetupEntity,
    queryable: ProgrammeContentQueryable,
  ): Promise<Programme | undefined> {
    if (setup.assignedProgrammeVersionId) {
      return this.findProgrammeVersion(
        setup.assignedProgrammeVersionId,
        queryable,
      );
    }

    return undefined;
  }
}

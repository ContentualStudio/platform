import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { localDateFor } from "../common/timezone";
import { ContentEventBatch, dispatchAfterCommit } from "../content-engine/event-batch";
import { ContentEventDispatcher } from "../content-engine/event-dispatcher";
import { UserProfileEntity } from "../profile/entities/user-profile.entity";
import {
  BadgeCelebrationService,
  type PendingBadgeCelebration,
} from "./badge-celebration.service";
import { GamificationService } from "./gamification.service";
import { UserAchievementsService, type UserAchievements } from "./user-achievements.service";

// The eager streak-break sweep, triggered by its own caller rather than a
// scheduler — nothing in this repo schedules anything yet. A cross-user
// scheduled sweep (calling recordStreakBreaks for every active streak) is the
// natural follow-up once one exists; this endpoint exercises the same
// service method for the caller's own streak in the meantime.
@Controller("gamification")
@UseGuards(SessionGuard)
export class GamificationController {
  private readonly logger = new Logger(GamificationController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly gamification: GamificationService,
    private readonly eventDispatcher: ContentEventDispatcher,
    private readonly celebrations: BadgeCelebrationService,
    private readonly achievements: UserAchievementsService,
  ) {}

  // The Programs › Achievements tab: earned badges and the live streak.
  @Get("achievements")
  achievementsForUser(@CurrentUser() user: AuthenticatedUser): Promise<UserAchievements> {
    return this.achievements.forUser(user.id);
  }

  // Read at session start and whenever a badge_earned notification arrives, so
  // a badge released while the user was away is still celebrated.
  @Get("badges/celebrations")
  async pendingCelebrations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ celebrations: PendingBadgeCelebration[] }> {
    return { celebrations: await this.celebrations.listPending(user.id) };
  }

  @Post("badges/celebrations/:celebrationId/shown")
  @HttpCode(HttpStatus.OK)
  async markCelebrationShown(
    @CurrentUser() user: AuthenticatedUser,
    @Param("celebrationId") celebrationId: string,
  ): Promise<{ shown: true }> {
    if (!(await this.celebrations.markShown(user.id, celebrationId))) {
      throw new NotFoundException({
        code: "BADGE_CELEBRATION_NOT_FOUND",
        message: "That badge celebration could not be found.",
      });
    }

    return { shown: true };
  }

  @Post("streak-sweep")
  async sweep(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ broke: boolean }> {
    const batch = new ContentEventBatch();

    await this.dataSource.transaction(async (manager) => {
      const profile = await manager.findOneBy(UserProfileEntity, {
        userId: user.id,
      });
      const asOfLocalDate = localDateFor(new Date(), profile?.timezone ?? "UTC");

      await this.gamification.recordStreakBreaks(manager, batch, {
        userId: user.id,
        asOfLocalDate,
      });
    });

    await dispatchAfterCommit(this.eventDispatcher, this.logger, batch.eventIds);

    return { broke: batch.eventIds.length > 0 };
  }
}

import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { ProgrammeContentModule } from "../challenge-setup/programmes/programme-content.module";
import { EmailModule } from "../email/email.module";
import { ProgrammeTasksModule } from "../programme-tasks/programme-tasks.module";
import { AvatarStoreModule } from "../profile/avatar-store.module";
import { AdminAnalyticsController } from "./analytics/admin-analytics.controller";
import { AdminAnalyticsService } from "./analytics/admin-analytics.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminSessionGuard } from "./admin-session.guard";
import { AdminController } from "./admin.controller";
import { AdminEngineActivityController } from "./engine-activity/admin-engine-activity.controller";
import { AdminEngineActivityService } from "./engine-activity/admin-engine-activity.service";
import { AdminSupportController } from "./support/admin-support.controller";
import { AdminSupportService } from "./support/admin-support.service";
import { AdminTeamController } from "./team/admin-team.controller";
import { AdminTeamService } from "./team/admin-team.service";
import { AdminUsersController } from "./users/admin-users.controller";
import { AdminUsersService } from "./users/admin-users.service";
import { AdminUserDetailService } from "./users/admin-user-detail.service";

/**
 * The internal admin. Deliberately does not import AuthModule: nothing here
 * should be able to reach a product session, and later admin sections import
 * the domain modules they read from, not the product's auth.
 */
@Module({
  // Domain modules the admin reads from. ProgrammeTasksModule is imported for
  // ProgrammeHistoryService; admin endpoints still authenticate only with the
  // admin session guard, never a product session. BillingModule is imported
  // for the founding-creator writes the support actions make.
  imports: [
    EmailModule,
    AvatarStoreModule,
    ProgrammeContentModule,
    ProgrammeTasksModule,
    BillingModule,
  ],
  controllers: [
    AdminAuthController,
    AdminController,
    AdminUsersController,
    AdminAnalyticsController,
    AdminTeamController,
    AdminSupportController,
    AdminEngineActivityController,
  ],
  providers: [
    AdminAuthService,
    AdminSessionGuard,
    AdminUsersService,
    AdminUserDetailService,
    AdminAnalyticsService,
    AdminTeamService,
    AdminSupportService,
    AdminEngineActivityService,
  ],
  exports: [AdminAuthService, AdminSessionGuard],
})
export class AdminModule {}

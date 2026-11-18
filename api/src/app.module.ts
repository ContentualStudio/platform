import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule } from "@nestjs/config";
import adminAuthConfig from "./config/admin-auth.config";
import awsConfig from "./config/aws.config";
import authConfig from "./config/auth.config";
import billingConfig from "./config/billing.config";
import contentEngineAdminConfig from "./config/content-engine-admin.config";
import databaseConfig from "./config/database.config";
import emailConfig from "./config/email.config";
import gamificationConfig from "./config/gamification.config";
import instagramConfig from "./config/instagram.config";
import posthogConfig from "./config/posthog.config";
import programmeMatchingConfig from "./config/programme-matching.config";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ChallengeSetupModule } from "./challenge-setup/challenge-setup.module";
import { ContentEngineModule } from "./content-engine/content-engine.module";
import { DatabaseModule } from "./database/database.module";
import { EmailModule } from "./email/email.module";
import { GamificationModule } from "./gamification/gamification.module";
import { InstagramModule } from "./instagram/instagram.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { ProfileModule } from "./profile/profile.module";
import { ProgrammeTasksModule } from "./programme-tasks/programme-tasks.module";
import { StudioModule } from "./studio/studio.module";
import { ProgrammeMatchingAdminModule } from "./programme-matching-admin/programme-matching-admin.module";
import { ProgressionModule } from "./progression/progression.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { InstagramDailyPullJob } from "./instagram/instagram-daily-pull.job";
import { ProgrammeEnrolmentModule } from "./programme-enrolment/programme-enrolment.module";
import { ProgrammeDayServeJob } from "./programme-enrolment/programme-day-serve.job";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [".env.local", ".env"],
      load: [
        adminAuthConfig,
        awsConfig,
        authConfig,
        billingConfig,
        contentEngineAdminConfig,
        databaseConfig,
        emailConfig,
        gamificationConfig,
        instagramConfig,
        posthogConfig,
        programmeMatchingConfig,
      ],
      isGlobal: true,
    }),
    // Before the feature modules: it is @Global, and every one of them captures
    // through it.
    ObservabilityModule,
    DatabaseModule,
    AuthModule,
    AdminModule,
    ProfileModule,
    BillingModule,
    ChallengeSetupModule,
    ContentEngineModule,
    GamificationModule,
    InstagramModule,
    NotificationsModule,
    ProgrammeTasksModule,
    StudioModule,
    ProgrammeMatchingAdminModule,
    ProgressionModule,
    ProgrammeEnrolmentModule,
    // The generic 7am-local dispatcher. Feature modules contribute the jobs;
    // the scheduler itself knows about none of them.
    SchedulingModule.forRoot({
      imports: [InstagramModule, ProgrammeEnrolmentModule],
      inject: [InstagramDailyPullJob, ProgrammeDayServeJob],
    }),
    StorageModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

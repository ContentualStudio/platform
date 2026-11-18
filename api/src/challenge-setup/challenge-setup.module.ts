import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { ContentEngineModule } from "../content-engine/content-engine.module";
import { UserProfileEntity } from "../profile/entities/user-profile.entity";
import { ChallengeSetupController } from "./challenge-setup.controller";
import { ChallengeSetupService } from "./challenge-setup.service";
import { ProgrammeStartController } from "./programme-start.controller";
import { ProgressionModule } from "../progression/progression.module";
import { ChallengeSetupEntity } from "./entities/challenge-setup.entity";
import { ProgrammeAssignmentEntity } from "./entities/programme-assignment.entity";
import { ProgrammeAssignmentRepository } from "./programmes/programme-assignment.repository";
import { ProgrammeMatcher } from "./programmes/programme-matcher";
import { ProgrammeContentModule } from "./programmes/programme-content.module";
import { ProgrammeMatchingModule } from "./programmes/programme-matching.module";
import { ProgrammeEnrolmentModule } from "../programme-enrolment/programme-enrolment.module";
import {
  EnvironmentLegacyProgrammeMatcher,
  LEGACY_PROGRAMME_MATCHER,
  MATCHING_ROLLOUT,
  MatchingRollout,
} from "./programmes/matching-rollout";

@Module({
  imports: [
    AuthModule,
    ProgressionModule,
    ProgrammeContentModule,
    ProgrammeEnrolmentModule,
    // The published matching snapshot is its own module: it is read on the
    // completion path and, later, by preview and support tooling, none of
    // which should have to import the whole challenge-setup module to get it.
    ProgrammeMatchingModule,
    // Programme start is the Content Engine's programme.started source of
    // truth. The module is imported for the emitter and dispatcher rather than
    // reaching into the outbox repository directly.
    ContentEngineModule,
    TypeOrmModule.forFeature([
      ChallengeSetupEntity,
      ProgrammeAssignmentEntity,
      UserProfileEntity,
    ]),
  ],
  controllers: [ChallengeSetupController, ProgrammeStartController],
  // Assignment resolves the matched slug against published content before it
  // commits, and the Welcome Page reads the authored programme back through
  // the same reader, so ProgrammeContentModule is imported above rather than
  // the service reaching for a second content dependency.
  providers: [
    ChallengeSetupService,
    ProgrammeMatcher,
    ProgrammeAssignmentRepository,
    EnvironmentLegacyProgrammeMatcher,
    MatchingRollout,
    {
      provide: LEGACY_PROGRAMME_MATCHER,
      useExisting: EnvironmentLegacyProgrammeMatcher,
    },
    {
      provide: MATCHING_ROLLOUT,
      useExisting: MatchingRollout,
    },
  ],
  exports: [ChallengeSetupService],
})
export class ChallengeSetupModule {}

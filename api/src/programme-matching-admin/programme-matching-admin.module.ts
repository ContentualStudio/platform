import { Module } from "@nestjs/common";
import { ChallengeSetupModule } from "../challenge-setup/challenge-setup.module";
import { ProgrammeMatchingAdminController } from "./programme-matching-admin.controller";
import { ProgrammeMatchingAdminGuard } from "./programme-matching-admin.guard";
import { ProgrammeMatchingAdminService } from "./programme-matching-admin.service";

@Module({
  imports: [ChallengeSetupModule],
  controllers: [ProgrammeMatchingAdminController],
  providers: [ProgrammeMatchingAdminGuard, ProgrammeMatchingAdminService],
})
export class ProgrammeMatchingAdminModule {}

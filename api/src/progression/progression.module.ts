import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { ContentEngineModule } from "../content-engine/content-engine.module";
import { ProgrammeEnrolmentModule } from "../programme-enrolment/programme-enrolment.module";
import { ProgrammeContentModule } from "../challenge-setup/programmes/programme-content.module";
import { EligibleProgrammesService } from "./eligible-programmes.service";
import { ProgrammeSuggestionService } from "./programme-suggestion.service";
import { ProgressionController } from "./progression.controller";
import { ProgressionService } from "./progression.service";

@Module({
  imports: [
    AuthModule,
    BillingModule,
    ContentEngineModule,
    ProgrammeContentModule,
    ProgrammeEnrolmentModule,
  ],
  controllers: [ProgressionController],
  providers: [
    ProgressionService,
    EligibleProgrammesService,
    ProgrammeSuggestionService,
  ],
  exports: [ProgressionService, EligibleProgrammesService],
})
export class ProgressionModule {}

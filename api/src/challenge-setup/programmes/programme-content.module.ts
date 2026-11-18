import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import {
  PROGRAMME_CONTENT_READER,
  ProgrammeContentRepository,
} from "./programme-content.repository";
import { ProgrammeVersionRepository } from "./programme-version.repository";

@Module({
  imports: [DatabaseModule],
  providers: [
    ProgrammeContentRepository,
    ProgrammeVersionRepository,
    {
      provide: PROGRAMME_CONTENT_READER,
      useExisting: ProgrammeContentRepository,
    },
  ],
  exports: [
    PROGRAMME_CONTENT_READER,
    ProgrammeContentRepository,
    ProgrammeVersionRepository,
  ],
})
export class ProgrammeContentModule {}

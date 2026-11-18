import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import {
  PROGRAMME_MATCHING_READER,
  ProgrammeMatchingRepository,
} from "./programme-matching.repository";

// Read-only access to the one active published matching snapshot. Kept apart
// from challenge-setup because preview, support explanation and the operational
// verifier all need the same reader without inheriting the assignment flow.
@Module({
  imports: [DatabaseModule],
  providers: [
    ProgrammeMatchingRepository,
    {
      provide: PROGRAMME_MATCHING_READER,
      useExisting: ProgrammeMatchingRepository,
    },
  ],
  exports: [PROGRAMME_MATCHING_READER, ProgrammeMatchingRepository],
})
export class ProgrammeMatchingModule {}

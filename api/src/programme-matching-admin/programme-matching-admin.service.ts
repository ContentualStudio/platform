import { Injectable } from "@nestjs/common";
import {
  ChallengeSetupService,
  type RematchProgrammeInput,
} from "../challenge-setup/challenge-setup.service";

@Injectable()
export class ProgrammeMatchingAdminService {
  constructor(private readonly challengeSetup: ChallengeSetupService) {}

  rematch(input: RematchProgrammeInput) {
    return this.challengeSetup.rematchProgramme(input);
  }
}

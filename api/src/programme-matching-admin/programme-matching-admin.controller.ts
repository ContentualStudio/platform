import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { parseWithSchema } from "../common/zod-http";
import {
  ProgrammeMatchingAdminGuard,
  type ProgrammeMatchingAdminRequest,
} from "./programme-matching-admin.guard";
import { ProgrammeMatchingAdminService } from "./programme-matching-admin.service";

const rematchBodySchema = z.object({
  attemptId: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(1000),
  confirmation: z.literal("REMATCH"),
});

@Controller("admin/programme-matching")
@UseGuards(ProgrammeMatchingAdminGuard)
export class ProgrammeMatchingAdminController {
  constructor(private readonly service: ProgrammeMatchingAdminService) {}

  @Post("users/:userId/rematch")
  async rematch(
    @Param("userId") userId: string,
    @Body() body: unknown,
    @Req() request: ProgrammeMatchingAdminRequest,
  ) {
    const input = parseWithSchema(
      rematchBodySchema,
      body,
      "INVALID_REMATCH_REQUEST",
      'attemptId, reason and confirmation="REMATCH" are required.',
    );

    return this.service.rematch({
      userId: userId.trim(),
      actor: request.programmeMatchingActor!,
      reason: input.reason,
      attemptId: input.attemptId,
    });
  }
}

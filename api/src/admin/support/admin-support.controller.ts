import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { parseWithSchema } from "../../common/zod-http";
import type { AdminIdentity } from "../admin-auth.service";
import { AdminSessionGuard, CurrentAdmin } from "../admin-session.guard";
import { AdminSupportService } from "./admin-support.service";
import { supportActionKeys } from "./support-actions";

const supportActionSchema = z
  .object({
    action: z.enum(supportActionKeys),
    reason: z
      .string()
      .trim()
      .min(3, "Give a short reason for this action.")
      .max(500, "Keep the reason under 500 characters."),
  })
  .strict();

@Controller("admin/users/:id/support")
@UseGuards(AdminSessionGuard)
export class AdminSupportController {
  constructor(private readonly support: AdminSupportService) {}

  @Get()
  overview(@Param("id") id: string) {
    return this.support.overview(id);
  }

  @Post()
  @HttpCode(200)
  apply(@CurrentAdmin() admin: AdminIdentity, @Param("id") id: string, @Body() body: unknown) {
    const input = parseWithSchema(
      supportActionSchema,
      body,
      "INVALID_SUPPORT_ACTION",
      "Choose a support action and give a reason.",
    );

    return this.support.apply(admin, id, input);
  }
}

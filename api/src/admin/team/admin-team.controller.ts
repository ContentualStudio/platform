import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { emailSchema } from "../../auth/auth.schemas";
import { parseWithSchema } from "../../common/zod-http";
import type { AdminIdentity } from "../admin-auth.service";
import { AdminSessionGuard, CurrentAdmin } from "../admin-session.guard";
import { AdminTeamService } from "./admin-team.service";

const inviteSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().max(80).optional(),
  })
  .strict();

@Controller("admin/team")
@UseGuards(AdminSessionGuard)
export class AdminTeamController {
  constructor(private readonly team: AdminTeamService) {}

  @Get()
  list() {
    return this.team.list();
  }

  @Post("invite")
  @HttpCode(200)
  invite(@CurrentAdmin() admin: AdminIdentity, @Body() body: unknown) {
    const input = parseWithSchema(
      inviteSchema,
      body,
      "INVALID_ADMIN_INVITE",
      "Enter a valid email address.",
    );

    return this.team.invite(admin, input);
  }

  @Delete(":id")
  remove(@CurrentAdmin() admin: AdminIdentity, @Param("id") id: string) {
    return this.team.remove(admin, id);
  }
}

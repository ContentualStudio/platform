import { Controller, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { parseWithSchema } from "../../common/zod-http";
import { ProgrammeHistoryService } from "../../programme-tasks/programme-history.service";
import { AvatarStoreService } from "../../profile/avatar-store.service";
import { AdminSessionGuard } from "../admin-session.guard";
import { AdminUserDetailService } from "./admin-user-detail.service";
import { adminUsersQuerySchema } from "./admin-users.schemas";
import { AdminUsersService } from "./admin-users.service";

@Controller("admin/users")
@UseGuards(AdminSessionGuard)
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly avatars: AvatarStoreService,
    private readonly detail: AdminUserDetailService,
    private readonly history: ProgrammeHistoryService,
  ) {}

  @Get()
  list(@Query() query: unknown) {
    const parsed = parseWithSchema(
      adminUsersQuerySchema,
      query,
      "INVALID_ADMIN_USERS_QUERY",
      "The user list query is invalid.",
    );

    return this.users.list(parsed);
  }

  // The single-user view: one endpoint per panel so each loads and fails on
  // its own. Only the header 404s; the panels answer empty for a user with
  // no data of that kind.
  @Get(":id")
  one(@Param("id") id: string) {
    return this.users.findOne(id);
  }

  @Get(":id/programmes")
  programmes(@Param("id") id: string) {
    // The user's own programme history, so the percentages match theirs.
    return this.history.forUserId(id);
  }

  @Get(":id/progress")
  progress(@Param("id") id: string) {
    return this.detail.progress(id);
  }

  @Get(":id/badges")
  badges(@Param("id") id: string) {
    return this.detail.badges(id);
  }

  @Get(":id/platform")
  platform(@Param("id") id: string) {
    return this.detail.platform(id);
  }

  /**
   * Any user's stored avatar, for the admin.
   *
   * `user.image` points at /profile/me/avatar, which only ever answers the
   * avatar's owner, so the admin needs its own door. Same caching contract
   * as that endpoint: private (it is personal data) and revalidated by ETag.
   */
  @Get(":id/avatar")
  async avatar(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const avatar = await this.avatars.find(id);

    if (!avatar) {
      response.status(404).end();
      return;
    }

    const etag = `"${avatar.etag}"`;

    response.setHeader("Content-Type", avatar.contentType);
    response.setHeader("ETag", etag);
    response.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

    if (request.headers["if-none-match"] === etag) {
      response.status(304).end();
      return;
    }

    response.setHeader("Content-Length", String(avatar.bytes.byteLength));
    response.status(200).send(avatar.bytes);
  }
}

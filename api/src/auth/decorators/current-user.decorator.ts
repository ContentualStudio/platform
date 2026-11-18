import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import {
  sessionRequiredError,
  type AuthenticatedUser,
} from "../guards/session.guard";

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw sessionRequiredError();
    }

    return request.user;
  },
);

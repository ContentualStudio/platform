import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AdminAuthService, type AdminIdentity } from "./admin-auth.service";

export type AdminRequest = Request & { admin?: AdminIdentity };

export function adminSessionRequiredError() {
  return new UnauthorizedException({
    code: "ADMIN_SESSION_REQUIRED",
    message: "A valid admin session is required.",
  });
}

/**
 * Admits only requests carrying an admin-instance session.
 *
 * Every admin controller, read or write, sits behind this. A product session
 * cookie is a different cookie signed with a different secret, so a creator's
 * session is simply absent here rather than "present but unprivileged".
 */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly adminAuth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AdminRequest>();
    const admin = await this.adminAuth.getSession(
      request,
      http.getResponse<Response>(),
    );

    if (!admin) {
      throw adminSessionRequiredError();
    }

    request.admin = admin;
    return true;
  }
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminIdentity => {
    const request = ctx.switchToHttp().getRequest<AdminRequest>();

    if (!request.admin) {
      throw adminSessionRequiredError();
    }

    return request.admin;
  },
);

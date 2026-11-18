import { timingSafeEqual } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

export const PROGRAMME_MATCHING_ADMIN_TOKEN_HEADER =
  "x-programme-matching-admin-token";

export type ProgrammeMatchingAdminRequest = Request & {
  programmeMatchingActor?: string;
};

function reject() {
  return new UnauthorizedException({
    code: "PROGRAMME_MATCHING_ADMIN_TOKEN_REQUIRED",
    message: "A valid programme matching admin token is required.",
  });
}

function matches(presented: string, expected: string): boolean {
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Rematching changes a user's active journey and is intentionally protected
 * by a separate credential from the content-engine backfill endpoints.
 */
@Injectable()
export class ProgrammeMatchingAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("programmeMatchingAdmin.token");
    const actor = this.config.get<string>("programmeMatchingAdmin.actor")?.trim();

    if (!expected || !actor) {
      throw reject();
    }

    const request = context
      .switchToHttp()
      .getRequest<ProgrammeMatchingAdminRequest>();
    const presented = request.headers[PROGRAMME_MATCHING_ADMIN_TOKEN_HEADER];

    if (typeof presented !== "string" || !matches(presented, expected)) {
      throw reject();
    }

    // The audited identity belongs to the server-side credential. Never trust
    // a caller-controlled header for the actor recorded against a rematch.
    request.programmeMatchingActor = actor;
    return true;
  }
}

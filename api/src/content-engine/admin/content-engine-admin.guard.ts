import { timingSafeEqual } from "node:crypto";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

export const ADMIN_TOKEN_HEADER = "x-content-engine-admin-token";

function unauthorised() {
  return new UnauthorizedException({
    code: "ADMIN_TOKEN_REQUIRED",
    message: "A valid Content Engine admin token is required.",
  });
}

// Constant-time, and length-checked first because timingSafeEqual throws on a
// length mismatch — which would otherwise leak the token's length through the
// difference between a thrown error and a returned false.
function matches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Guards the Content Engine's operator endpoints.
 *
 * Fails closed. An unset `CONTENT_ENGINE_ADMIN_TOKEN` rejects every request
 * rather than waving them through: the endpoints behind this guard can fire
 * effects for every user in the product, so the failure mode of a
 * misconfigured environment must be "nothing works", never "anyone can".
 */
@Injectable()
export class ContentEngineAdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("contentEngineAdmin.token");

    if (!expected) {
      throw unauthorised();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const presented = request.headers[ADMIN_TOKEN_HEADER];

    if (typeof presented !== "string" || !matches(presented, expected)) {
      throw unauthorised();
    }

    return true;
  }
}

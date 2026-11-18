import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { clientIp } from "../common/client-ip";
import { parseWithSchema } from "../common/zod-http";
import { FixedWindowLimiter } from "./deletion-rate-limit";
import { MetaDeauthorizeService } from "./meta-deauthorize.service";
import { MetaDeletionService } from "./meta-deletion.service";

/**
 * Meta's Data Deletion Request Callback.
 *
 * Public and unauthenticated by necessity — Meta calls it server-to-server, and
 * the `signed_request` signature is the authentication. Every other route in
 * this api sits behind a session; this one is the exception, so it is kept
 * deliberately small: verify, erase, answer with a code, and nothing else.
 *
 * The response body carries the confirmation url and code and no user data at
 * all. Echoing anything about the account would turn a deletion endpoint into
 * an account-existence oracle for anyone able to forge a request.
 */
const signedRequestSchema = z
  .object({ signed_request: z.string().trim().min(1) })
  .passthrough();

const statusSchema = z.object({ code: z.string().trim().uuid() }).strict();

@Controller("instagram")
export class MetaDeletionController {
  // 60 an hour per caller. Generous for a real platform callback and low enough
  // to make a forged-request loop pointless.
  private readonly limiter = new FixedWindowLimiter(60, 60 * 60_000);

  constructor(
    private readonly deletion: MetaDeletionService,
    private readonly deauthorize: MetaDeauthorizeService,
  ) {}

  /**
   * Meta's deauthorize callback, fired when a user removes the app.
   *
   * Public and unauthenticated for the same reason as the deletion callback:
   * Meta calls it server-to-server and the `signed_request` signature is the
   * authentication. It answers `200` with an empty body — Meta specifies no
   * response shape, and anything we invented would leak whether the account
   * was known to us.
   */
  @Post("deauthorize")
  @HttpCode(HttpStatus.OK)
  async handleDeauthorize(@Req() request: Request, @Body() body: unknown) {
    if (!this.limiter.tryConsume(clientIp(request))) {
      throw new HttpException(
        { code: "RATE_LIMITED", message: "Too many deauthorize requests." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { signed_request: signedRequest } = parseWithSchema(
      signedRequestSchema,
      body,
      "INVALID_SIGNED_REQUEST",
      "A signed_request is required.",
    );

    const outcome = await this.deauthorize.handleSignedRequest(signedRequest);

    if (!outcome.ok) {
      // Uniform, like the deletion route: the reason goes to our logs. A 400
      // also tells Meta to retry, which is what a failed purge needs.
      throw new BadRequestException({
        code: "INVALID_SIGNED_REQUEST",
        message: "The deauthorize request could not be verified.",
      });
    }

    return {};
  }

  @Post("data-deletion")
  @HttpCode(HttpStatus.OK)
  async handle(@Req() request: Request, @Body() body: unknown) {
    if (!this.limiter.tryConsume(clientIp(request))) {
      throw new HttpException(
        { code: "RATE_LIMITED", message: "Too many deletion requests." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const { signed_request: signedRequest } = parseWithSchema(
      signedRequestSchema,
      body,
      "INVALID_SIGNED_REQUEST",
      "A signed_request is required.",
    );

    const outcome = await this.deletion.handleSignedRequest(signedRequest);

    if (!outcome.ok) {
      // Deliberately uniform: the reason goes to our logs, not to the caller.
      // Telling an unverified caller *why* verification failed helps only them.
      throw new BadRequestException({
        code: "INVALID_SIGNED_REQUEST",
        message: "The deletion request could not be verified.",
      });
    }

    // Exactly the two fields Meta expects, and nothing else.
    return { url: outcome.url, confirmation_code: outcome.confirmationCode };
  }

  /** Lets a user (or Meta) check on a deletion by its confirmation code. */
  @Get("data-deletion/status")
  async status(@Query() query: unknown) {
    const { code } = parseWithSchema(
      statusSchema,
      query,
      "INVALID_CONFIRMATION_CODE",
      "Provide a confirmation code.",
    );

    const status = await this.deletion.findStatus(code);

    if (!status) {
      throw new NotFoundException({
        code: "DELETION_REQUEST_NOT_FOUND",
        message: "No deletion request matches that code.",
      });
    }

    return status;
  }
}

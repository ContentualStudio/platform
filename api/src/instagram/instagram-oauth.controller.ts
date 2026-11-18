import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { z } from "zod";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { parseWithSchema } from "../common/zod-http";
import {
  InstagramConnectService,
  type ConnectOutcome,
} from "./instagram-connect.service";
import { InstagramOauthService } from "./instagram-oauth.service";
import { InstagramTokenService } from "./instagram-token.service";

/**
 * The Meta-facing half of the Instagram integration.
 *
 * Separate from InstagramController because of one method: the OAuth callback
 * cannot sit under `SessionGuard`. Meta redirects the *browser* to it, and
 * while the session cookie is usually present — the callback is first-party
 * through the /api-proxy prefix — it cannot be relied on. The single-use
 * `state` row is what authenticates that redirect.
 */
const consentSchema = z.object({ granted: z.boolean() }).strict();

const startSchema = z
  .object({
    consent: z.literal(true),
    returnPath: z.string().trim().max(512).optional(),
  })
  .strict();

@Controller("instagram")
export class InstagramOauthController {
  constructor(
    private readonly oauth: InstagramOauthService,
    private readonly connect: InstagramConnectService,
    private readonly tokens: InstagramTokenService,
    private readonly config: ConfigService,
  ) {}

  /** The non-secret connection view the platforms and settings screens read. */
  @Get("connection")
  @UseGuards(SessionGuard)
  async getConnection(@CurrentUser() user: AuthenticatedUser) {
    const connection = await this.tokens.getConnection(user.id);

    if (!connection) {
      return { connected: false, connection: null, available: this.oauth.configured };
    }

    return {
      connected: true,
      available: this.oauth.configured,
      connection: {
        username: connection.username,
        accountType: connection.accountType,
        status: connection.status,
        dataConsent: connection.dataConsent,
        connectedAt: connection.connectedAt.toISOString(),
        scopes: connection.scopes,
      },
    };
  }

  /**
   * Records the user's data consent.
   *
   * Withdrawing it does not disconnect: the connection stays, and the daily
   * pull stops. That is the difference the settings toggle offers over the
   * disconnect button, which also deletes.
   */
  @Post("consent")
  @UseGuards(SessionGuard)
  async setConsent(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { granted } = parseWithSchema(
      consentSchema,
      body,
      "INVALID_INSTAGRAM_CONSENT",
      "Say whether data consent is granted.",
    );

    const recorded = await this.tokens.setConsent(user.id, granted);

    return { granted, recorded };
  }

  /**
   * Begins authorization.
   *
   * Consent is a precondition, not a step that runs alongside: the user has to
   * accept before we send them to Instagram, because the authorization itself
   * is the first act of reading their data.
   */
  @Post("oauth/start")
  @UseGuards(SessionGuard)
  async start(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    if (!this.oauth.configured) {
      // An authorize url built from a missing app id would land the user on an
      // Instagram error page. "Not available yet" is the better answer.
      throw new ServiceUnavailableException({
        code: "INSTAGRAM_NOT_CONFIGURED",
        message: "Instagram connection is not available yet.",
      });
    }

    const { consent, returnPath } = parseWithSchema(
      startSchema,
      body,
      "INSTAGRAM_CONSENT_REQUIRED",
      "Accept the data consent step before connecting Instagram.",
    );

    const started = await this.oauth.startAuthorization({
      userId: user.id,
      dataConsent: consent,
      returnPath: returnPath ?? null,
    });

    return { authorizeUrl: started.authorizeUrl };
  }

  /**
   * Where Meta sends the browser back.
   *
   * Always a redirect, never a JSON body: the user is looking at this. Failure
   * carries a reason the web app turns into a retryable banner, and never
   * blocks onboarding.
   */
  @Get("oauth/callback")
  async callback(
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ) {
    const outcome = await this.connect.completeAuthorization({
      code: query.code,
      state: query.state,
      error: query.error ?? query.error_reason,
    });

    response.redirect(this.resultUrl(outcome));
  }

  /** Re-reads the account type after the user converts to a professional one. */
  @Post("recheck")
  @UseGuards(SessionGuard)
  async recheck(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.connect.recheckAccountType(user.id);

    if (!result) {
      throw new BadRequestException({
        code: "INSTAGRAM_RECHECK_FAILED",
        message: "We couldn't read your Instagram account. Try again.",
      });
    }

    return result;
  }

  private resultUrl(outcome: ConnectOutcome): string {
    const webOrigin =
      this.config.get<string>("auth.webOrigin") ?? "http://localhost:3000";
    // Only a path from our own state row is ever honoured, so the callback
    // cannot be turned into an open redirect by a crafted query string.
    const path =
      outcome.returnPath?.startsWith("/") && !outcome.returnPath.startsWith("//")
        ? outcome.returnPath
        : "/platforms";
    const url = new URL(path, webOrigin);

    if (outcome.ok) {
      url.searchParams.set("instagram", "connected");
      url.searchParams.set("username", outcome.username);
      url.searchParams.set("accountType", outcome.accountType);

      // The sub-100 case is a note, not a block, and the web app needs to know
      // which of the two graceful states to show.
      if (outcome.accountType === "professional" && outcome.followerCount < 100) {
        url.searchParams.set("limited", "followers");
      }
    } else {
      url.searchParams.set("instagram", "error");
      url.searchParams.set("reason", outcome.reason);
    }

    return url.toString();
  }
}

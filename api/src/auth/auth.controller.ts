import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { parseWithSchema } from "../common/zod-http";
import { preAuthIdentity } from "../observability/anonymous-identity";
import {
  PRODUCT_ANALYTICS,
  type ProductAnalytics,
} from "../observability/product-analytics.port";
import {
  productEventTokens,
  type StandaloneProductEventName,
} from "../observability/product-events";
import { AuthService } from "./auth.service";
import {
  authIntentSchema,
  sendEmailCodeSchema,
  verifyEmailCodeSchema,
  type AuthIntent,
} from "./auth.schemas";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(PRODUCT_ANALYTICS)
    private readonly analytics: ProductAnalytics,
  ) {}

  @Get("google")
  async startGoogleSignIn(
    @Query("intent") intent: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    // An unrecognised value falls back to "login", the intent that cannot
    // create an account.
    const parsedIntent = authIntentSchema.safeParse(intent ?? undefined);

    await this.authService.startGoogleSignIn(
      request,
      response,
      parsedIntent.success ? parsedIntent.data : "login",
    );
  }

  @Get("complete")
  async completeSignIn(@Req() request: Request, @Res() response: Response) {
    await this.authService.completeSignIn(request, response);
  }

  @Post("sign-out")
  async signOut(@Req() request: Request, @Res() response: Response) {
    try {
      await this.authService.signOut(request, response);
    } catch (error) {
      throw this.toHttpException(error, "AUTH_SIGN_OUT_FAILED");
    }

    this.capture(request, productEventTokens.userSignedOut);
  }

  @Post("email/send-code")
  async sendEmailCode(@Body() body: unknown, @Req() request: Request) {
    const payload = parseWithSchema(
      sendEmailCodeSchema,
      body,
      "INVALID_AUTH_PAYLOAD",
      "The auth request payload is invalid.",
    );

    try {
      const result = await this.authService.sendEmailCode(payload);

      // Captured on success only, so the funnel counts codes that were actually
      // sent rather than every attempt at one. The code itself is never a
      // property — only which door the user came through.
      this.capture(request, productEventTokens.loginCodeRequested, payload.intent);

      return result;
    } catch (error) {
      throw this.toHttpException(error, "AUTH_SEND_CODE_FAILED");
    }
  }

  @Post("email/verify-code")
  async verifyEmailCode(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const payload = parseWithSchema(
      verifyEmailCodeSchema,
      body,
      "INVALID_AUTH_PAYLOAD",
      "The auth request payload is invalid.",
    );

    try {
      await this.authService.verifyEmailCode(payload, request, response);
    } catch (error) {
      throw this.toHttpException(error, "AUTH_VERIFY_CODE_FAILED");
    }

    // The intent is the only thing that distinguishes a first session from a
    // returning one here, and it has already been checked against the account by
    // the service — a "signup" that reached this line really did create one.
    this.capture(
      request,
      payload.intent === "signup"
        ? productEventTokens.userSignedUp
        : productEventTokens.userSignedIn,
      payload.intent,
    );
  }

  /**
   * Reports an auth moment against the browser's anonymous identity.
   *
   * Anonymous rather than user-attributed even for a completed sign-in, because
   * the session cookie has only just been written to the *response* — there is no
   * authenticated user on this request to attribute to. `posthog.identify()` on
   * the web, immediately after this call returns, is what joins this event and
   * the whole pre-auth funnel onto the real user.
   *
   * Best-effort: authentication must never fail because analytics did.
   */
  private capture(
    request: Request,
    event: StandaloneProductEventName,
    intent?: AuthIntent,
  ): void {
    const identity = preAuthIdentity(request);

    // No usable distinct id means no identity worth inventing.
    if (!identity) {
      return;
    }

    this.analytics.capture({
      identity,
      event,
      properties: intent ? { intent } : undefined,
    });
  }

  private toHttpException(error: unknown, fallbackCode: string) {
    if (error instanceof HttpException) {
      return error;
    }

    const maybeError = error as {
      body?: { code?: string; message?: string };
      code?: string;
      message?: string;
      status?: number;
      statusCode?: number;
    };
    const status = maybeError.status ?? maybeError.statusCode;
    const code = maybeError.body?.code ?? maybeError.code ?? fallbackCode;
    const message =
      maybeError.body?.message ??
      maybeError.message ??
      "Authentication request failed.";

    if (status === 400) {
      return new BadRequestException({ code, message });
    }

    if (status === 401 || status === 403) {
      return new UnauthorizedException({ code, message });
    }

    if (status === 404) {
      return new NotFoundException({ code, message });
    }

    if (status === 409) {
      return new ConflictException({ code, message });
    }

    return new InternalServerErrorException({ code, message });
  }
}

import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response as ExpressResponse } from "express";
import { Pool } from "pg";
import { EmailService } from "../email/email.service";
import { EmailSendResult } from "../email/email.types";
import {
  AuthIntent,
  SendEmailCodeInput,
  VerifyEmailCodeInput,
} from "./auth.schemas";
import { SocialAvatarService } from "./social-avatar.service";

type EmailOtpType = "sign-in";

export interface BetterAuthSession {
  onboardingCompleted: boolean;
  session: { id: string; expiresAt: Date; userId: string };
  user: { id: string; email: string; image: string | null; name: string };
}

interface GetSessionInput {
  headers: Headers;
  query?: { disableCookieCache?: boolean };
}

interface BetterAuthInstance {
  handler(request: globalThis.Request): Promise<globalThis.Response>;
  api: {
    getSession(
      input: GetSessionInput & { returnHeaders: true },
    ): Promise<{ headers: Headers; response: BetterAuthSession | null }>;
    getSession(input: GetSessionInput): Promise<BetterAuthSession | null>;
    sendVerificationOTP(input: {
      body: { email: string; type: EmailOtpType };
    }): Promise<{ success: boolean }>;
    signInEmailOTP(input: {
      asResponse: true;
      body: { email: string; image?: string; name?: string; otp: string };
      headers: Headers;
    }): Promise<globalThis.Response>;
    signInSocial(input: {
      asResponse: true;
      body: {
        callbackURL?: string;
        disableRedirect?: boolean;
        errorCallbackURL?: string;
        newUserCallbackURL?: string;
        provider: "google";
        requestSignUp?: boolean;
      };
      headers: Headers;
    }): Promise<globalThis.Response>;
    signOut(input: {
      asResponse: true;
      headers: Headers;
    }): Promise<globalThis.Response>;
  };
}

interface BetterAuthModule {
  betterAuth(options: Record<string, unknown>): BetterAuthInstance;
}

interface CustomSessionInput {
  session: { id: string; expiresAt: Date; userId: string };
  user: { id: string; email: string; image: string | null; name: string };
}

interface BetterAuthPluginsModule {
  customSession(
    fn: (input: CustomSessionInput) => Promise<Record<string, unknown>>,
  ): unknown;
  emailOTP(options: Record<string, unknown>): unknown;
}

// Nest compiles this package to CommonJS, while Better Auth is ESM-only.
const importEsm = new Function(
  "specifier",
  "return import(specifier)",
) as <T>(specifier: string) => Promise<T>;

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private auth?: BetterAuthInstance;
  private initPromise?: Promise<void>;
  private readonly otpEmailResults = new Map<string, EmailSendResult[]>();
  private pool?: Pool;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly socialAvatarService: SocialAvatarService,
  ) {}

  async onModuleInit() {
    await this.initAuth();
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async sendEmailCode(input: SendEmailCodeInput) {
    const auth = await this.getAuth();

    await this.assertIntentMatchesAccount(input.email, input.intent);

    const resultKey = this.otpEmailResultKey(input.email, "sign-in");

    this.otpEmailResults.delete(resultKey);

    await auth.api.sendVerificationOTP({
      body: {
        email: input.email,
        type: "sign-in",
      },
    });

    const emailResult = this.consumeOtpEmailResult(input.email, "sign-in");

    if (!emailResult) {
      throw new InternalServerErrorException({
        code: "AUTH_EMAIL_SEND_UNKNOWN",
        message: "The login code email could not be confirmed as sent.",
      });
    }

    if (!emailResult.ok) {
      throw new InternalServerErrorException({
        code: "AUTH_EMAIL_SEND_FAILED",
        message: emailResult.error,
      });
    }

    return { success: true };
  }

  async startGoogleSignIn(
    request: Request,
    response: ExpressResponse,
    intent: AuthIntent = "login",
  ) {
    const auth = await this.getAuth();
    const authScreenUrl = this.webUrl(
      intent === "signup" ? "/auth/signup" : "/auth/sign",
    );
    const authCompleteUrl = this.authUrl("/auth/complete");

    try {
      const authResponse = await auth.api.signInSocial({
        asResponse: true,
        body: {
          callbackURL: authCompleteUrl,
          disableRedirect: true,
          // Left bare so Better Auth's own `?error=` code (notably
          // `signup_disabled` when a login-intent Google account has no user)
          // is the only one on the URL — a preset `?error=` would be read
          // first by the web page and mask it.
          errorCallbackURL: authScreenUrl,
          newUserCallbackURL: authCompleteUrl,
          provider: "google",
          // Paired with `disableImplicitSignUp` on the provider: account
          // creation happens only when the user came in through /auth/signup.
          requestSignUp: intent === "signup",
        },
        headers: this.headersFromRequest(request),
      });
      const payload = (await authResponse.json().catch(() => ({}))) as {
        url?: string;
      };

      this.forwardSetCookie(authResponse.headers, response);

      if (!payload.url) {
        response.redirect(`${authScreenUrl}?error=google`);
        return;
      }

      response.redirect(payload.url);
    } catch {
      response.redirect(`${authScreenUrl}?error=google_config`);
    }
  }

  async completeSignIn(request: Request, response: ExpressResponse) {
    const auth = await this.getAuth();
    const authScreenUrl = this.webUrl("/auth/sign");

    const { headers, response: session } = await auth.api.getSession({
      headers: this.headersFromRequest(request),
      query: { disableCookieCache: true },
      returnHeaders: true,
    });

    this.forwardSetCookie(headers, response);

    if (!session) {
      response.redirect(`${authScreenUrl}?error=session`);
      return;
    }

    response.redirect(
      this.webUrl(session.onboardingCompleted ? "/dashboard" : "/onboarding"),
    );
  }

  async signOut(request: Request, response: ExpressResponse) {
    const auth = await this.getAuth();
    const authResponse = await auth.api.signOut({
      asResponse: true,
      headers: this.headersFromRequest(request),
    });

    await this.forwardAuthResponse(authResponse, response, {
      redirectTo: "/auth/sign",
    });
  }

  async handleBetterAuthRequest(request: Request, response: ExpressResponse) {
    const auth = await this.getAuth();
    const authResponse = await auth.handler(this.webRequestFromExpress(request));

    await this.forwardRawAuthResponse(authResponse, response);
  }

  async getCurrentSession(request: Request, response: ExpressResponse) {
    const auth = await this.getAuth();

    const { headers, response: session } = await auth.api.getSession({
      headers: this.headersFromRequest(request),
      returnHeaders: true,
    });

    this.forwardSetCookie(headers, response);

    return session;
  }

  // Called after a write that flips onboardingCompleted false -> true, so the
  // browser's cached session cookie (read statelessly by web/src/proxy.ts)
  // reflects completion immediately instead of waiting out its own maxAge.
  async refreshSessionCookieCache(request: Request, response: ExpressResponse) {
    const auth = await this.getAuth();

    const { headers } = await auth.api.getSession({
      headers: this.headersFromRequest(request),
      query: { disableCookieCache: true },
      returnHeaders: true,
    });

    this.forwardSetCookie(headers, response);
  }

  async verifyEmailCode(
    input: VerifyEmailCodeInput,
    request: Request,
    response: ExpressResponse,
  ) {
    const auth = await this.getAuth();

    // Re-checked here, not just at send-code: this endpoint is reachable
    // directly, and the account could also have been created in between.
    await this.assertIntentMatchesAccount(input.email, input.intent);

    const authResponse = await auth.api.signInEmailOTP({
      asResponse: true,
      body: {
        email: input.email,
        name: this.nameFromEmail(input.email),
        otp: input.code,
      },
      headers: this.headersFromRequest(request),
    });

    await this.forwardAuthResponse(authResponse, response);
  }

  // Login and sign-up are separate doors onto one OTP mechanism, so the split
  // is enforced here rather than by Better Auth's `disableSignUp`, which is a
  // static per-instance flag and cannot vary per request.
  private async assertIntentMatchesAccount(email: string, intent: AuthIntent) {
    const exists = await this.accountExists(email);

    if (intent === "login" && !exists) {
      throw new NotFoundException({
        code: "AUTH_ACCOUNT_NOT_FOUND",
        message: "No account found for that email address.",
      });
    }

    if (intent === "signup" && exists) {
      throw new ConflictException({
        code: "AUTH_ACCOUNT_EXISTS",
        message: "An account already exists for that email address.",
      });
    }
  }

  private async accountExists(email: string) {
    const pool = await this.getPool();
    const { rowCount } = await pool.query(
      'SELECT 1 FROM "user" WHERE lower("email") = $1 LIMIT 1',
      [email.toLowerCase()],
    );

    return (rowCount ?? 0) > 0;
  }

  private async getPool() {
    // The pool is created by createAuth(), so initialise through getAuth().
    await this.getAuth();

    if (!this.pool) {
      throw new InternalServerErrorException({
        code: "AUTH_NOT_INITIALIZED",
        message: "Authentication service is not initialized.",
      });
    }

    return this.pool;
  }

  private async getAuth() {
    if (!this.auth) {
      await this.initAuth();
    }

    if (!this.auth) {
      throw new InternalServerErrorException({
        code: "AUTH_NOT_INITIALIZED",
        message: "Authentication service is not initialized.",
      });
    }

    return this.auth;
  }

  private async initAuth() {
    if (this.auth) {
      return;
    }

    this.initPromise ??= this.createAuth();
    await this.initPromise;
  }

  private async createAuth() {
    const [{ betterAuth }, { emailOTP, customSession }] = await Promise.all([
      importEsm<BetterAuthModule>("better-auth"),
      importEsm<BetterAuthPluginsModule>("better-auth/plugins"),
    ]);

    const databaseUrl =
      this.configService.get<string>("database.url") ??
      "postgresql://postgres:postgres@localhost:5432/contentual";
    const useSsl = this.configService.get<boolean>("database.ssl") ?? false;
    const otpExpiresSeconds =
      this.configService.get<number>("auth.emailOtpExpiresSeconds") ?? 300;
    const allowedAttempts =
      this.configService.get<number>("auth.allowedAttempts") ?? 3;
    const resendRateLimitWindow =
      this.configService.get<number>("auth.resendRateLimitWindowSeconds") ?? 60;
    const resendRateLimitMax =
      this.configService.get<number>("auth.resendRateLimitMax") ?? 3;

    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    });

    this.pool = pool;

    this.auth = betterAuth({
      baseURL:
        this.configService.get<string>("auth.baseUrl") ??
        "http://localhost:3001",
      database: this.pool,
      socialProviders: this.getSocialProviders(),
      // Google hands us a googleusercontent.com URL and Better Auth writes it
      // to `user.image` verbatim. Copying the bytes into our own bucket here
      // makes a social avatar indistinguishable from an uploaded one, so the
      // picture survives Google rotating the URL and the profile code has an
      // `avatarKey` to replace or delete later. After-create hooks run once
      // the surrounding transaction has committed, so this writes through the
      // ordinary repositories rather than Better Auth's adapter.
      databaseHooks: {
        user: {
          create: {
            after: async (user: { id: string; image?: string | null }) => {
              await this.socialAvatarService.importForNewUser(user);
            },
          },
        },
      },
      session: {
        // Lets web/src/proxy.ts verify auth + onboarding status from a
        // signed cookie alone, with no api/DB round trip, on every
        // navigation. 60s bounds staleness for revoked-session bounces;
        // the false->true onboarding flip is corrected deterministically
        // via refreshSessionCookieCache(), not by waiting out this window.
        cookieCache: {
          enabled: true,
          maxAge: 60,
        },
      },
      plugins: [
        customSession(async ({ user, session }) => {
          const { rows } = await pool.query<{
            onboardingCompletedAt: Date | null;
          }>(
            'SELECT "onboardingCompletedAt" FROM user_profile WHERE "userId" = $1',
            [session.userId],
          );

          return {
            onboardingCompleted: Boolean(rows[0]?.onboardingCompletedAt),
            user,
            session,
          };
        }),
        emailOTP({
          allowedAttempts,
          expiresIn: otpExpiresSeconds,
          otpLength: 6,
          rateLimit: {
            max: resendRateLimitMax,
            window: resendRateLimitWindow,
          },
          resendStrategy: "rotate",
          sendVerificationOTP: async ({ email, otp }) => {
            const result = await this.emailService.sendLoginCode({
              code: otp,
              expiresInMinutes: Math.ceil(otpExpiresSeconds / 60),
              to: email,
            });

            this.recordOtpEmailResult(email, "sign-in", result);
          },
          storeOTP: "hashed",
        }),
      ],
      secret: this.getAuthSecret(),
      trustedOrigins:
        this.configService.get<string[]>("auth.trustedOrigins") ?? [],
    });
  }

  private getAuthSecret() {
    const configuredSecret = this.configService.get<string>("auth.secret");

    if (configuredSecret) {
      return configuredSecret;
    }

    if (process.env.NODE_ENV === "production") {
      throw new InternalServerErrorException({
        code: "AUTH_SECRET_MISSING",
        message: "BETTER_AUTH_SECRET is required in production.",
      });
    }

    return "contentual-development-better-auth-secret-change-before-prod";
  }

  private getSocialProviders() {
    const google =
      this.configService.get<{ clientId: string; clientSecret: string }>(
        "auth.google",
      );

    return google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            // Google can only create an account when startGoogleSignIn() opts
            // in with `requestSignUp`, i.e. from /auth/signup. A login-intent
            // callback for an unknown Google account is bounced back to the
            // sign-in page with `?error=signup_disabled`.
            disableImplicitSignUp: true,
          },
        }
      : {};
  }

  private headersFromRequest(request: Request) {
    const headers = new Headers();

    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          headers.append(key, item);
        }
      } else if (value !== undefined) {
        headers.set(key, String(value));
      }
    }

    return headers;
  }

  private async forwardAuthResponse(
    authResponse: globalThis.Response,
    response: ExpressResponse,
    options: { redirectTo: string } = { redirectTo: "/onboarding" },
  ) {
    authResponse.headers.forEach((value, key) => {
      if (!["content-length", "set-cookie"].includes(key.toLowerCase())) {
        response.setHeader(key, value);
      }
    });

    this.forwardSetCookie(authResponse.headers, response);

    const body = await authResponse.text();

    if (!authResponse.ok) {
      throw new UnauthorizedException({
        code: "INVALID_OTP",
        message: "Invalid or expired code.",
      });
    }

    const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};

    // The destination pages re-check onboarding status themselves on load
    // (see (protected)/onboarding and (protected)/dashboard), so this is
    // just a same-tab starting point, not the source of truth.
    response.status(authResponse.status).json({
      ...payload,
      redirectTo: options.redirectTo,
    });
  }

  private async forwardRawAuthResponse(
    authResponse: globalThis.Response,
    response: ExpressResponse,
  ) {
    authResponse.headers.forEach((value, key) => {
      if (!["content-length", "set-cookie"].includes(key.toLowerCase())) {
        response.setHeader(key, value);
      }
    });

    this.forwardSetCookie(authResponse.headers, response);

    const body = await authResponse.arrayBuffer();
    response.status(authResponse.status);

    if (body.byteLength === 0) {
      response.end();
      return;
    }

    response.send(Buffer.from(body));
  }

  private forwardSetCookie(headers: Headers, response: ExpressResponse) {
    const setCookieHeaders =
      (
        headers as Headers & {
          getSetCookie?: () => string[];
        }
      ).getSetCookie?.() ?? [];

    for (const cookie of setCookieHeaders) {
      response.append("Set-Cookie", cookie);
    }
  }

  private nameFromEmail(email: string) {
    return email.split("@")[0] || email;
  }

  private webRequestFromExpress(request: Request) {
    const baseUrl = (
      this.configService.get<string>("auth.baseUrl") ??
      `${request.protocol}://${request.get("host")}/api/auth`
    ).replace(/\/$/, "");
    const url = `${baseUrl}${request.url.startsWith("/") ? request.url : `/${request.url}`}`;
    const method = request.method.toUpperCase();
    const headers = this.headersFromRequest(request);
    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : JSON.stringify(request.body ?? {});

    return new Request(url, {
      body,
      headers,
      method,
    });
  }

  private webUrl(path: string) {
    const origin =
      this.configService.get<string>("auth.webOrigin") ??
      "http://localhost:3000";

    return new URL(path, origin).toString();
  }

  // The api's public url can carry a path when it is served under a prefix on
  // the web origin (`https://web.example/api-proxy`), so append rather than
  // resolve — `new URL("/auth/complete", base)` would drop that prefix and
  // point the OAuth callback at a route nothing serves.
  private authUrl(path: string) {
    const base = (
      this.configService.get<string>("auth.publicUrl") ??
      "http://localhost:3001"
    ).replace(/\/$/, "");

    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private recordOtpEmailResult(
    email: string,
    type: EmailOtpType,
    result: EmailSendResult,
  ) {
    const key = this.otpEmailResultKey(email, type);
    const results = this.otpEmailResults.get(key) ?? [];

    results.push(result);
    this.otpEmailResults.set(key, results);
  }

  private consumeOtpEmailResult(email: string, type: EmailOtpType) {
    const key = this.otpEmailResultKey(email, type);
    const results = this.otpEmailResults.get(key);
    const result = results?.shift();

    if (!results || results.length === 0) {
      this.otpEmailResults.delete(key);
    }

    return result;
  }

  private otpEmailResultKey(email: string, type: EmailOtpType) {
    return `${type}:${email.toLowerCase()}`;
  }
}

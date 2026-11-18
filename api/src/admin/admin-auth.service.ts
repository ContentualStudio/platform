import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response as ExpressResponse } from "express";
import { Pool } from "pg";
import { EmailService } from "../email/email.service";

export interface AdminIdentity {
  id: string;
  email: string;
  image: string | null;
  name: string;
}

interface AdminSession {
  session: { id: string; expiresAt: Date; userId: string };
  user: AdminIdentity;
}

interface AdminAuthInstance {
  api: {
    getSession(input: {
      headers: Headers;
      returnHeaders: true;
    }): Promise<{ headers: Headers; response: AdminSession | null }>;
    sendVerificationOTP(input: {
      body: { email: string; type: "sign-in" };
    }): Promise<{ success: boolean }>;
    signInEmailOTP(input: {
      asResponse: true;
      body: { email: string; otp: string };
      headers: Headers;
    }): Promise<globalThis.Response>;
    signOut(input: {
      asResponse: true;
      headers: Headers;
    }): Promise<globalThis.Response>;
  };
}

interface BetterAuthModule {
  betterAuth(options: Record<string, unknown>): AdminAuthInstance;
}

interface BetterAuthPluginsModule {
  emailOTP(options: Record<string, unknown>): unknown;
}

// Nest compiles this package to CommonJS, while Better Auth is ESM-only.
const importEsm = new Function(
  "specifier",
  "return import(specifier)",
) as <T>(specifier: string) => Promise<T>;

const OTP_EXPIRES_SECONDS = 300;
const OTP_ALLOWED_ATTEMPTS = 3;
const RESEND_WINDOW_MS = 60_000;
// Bounds how fast one client can ask "is this email an admin?", now that the
// answer is visible. Generous for a person retyping, useless for a list.
const LOOKUP_WINDOW_MS = 10 * 60_000;
const PRUNE_AT = 5_000;
const DEV_SECRET = "contentual-development-admin-auth-secret-change-before-prod";

export const ADMIN_COOKIE_PREFIX = "contentual-admin";

/**
 * A second, isolated Better Auth instance for the internal team.
 *
 * Shares no state with AuthService: its models are mapped onto the `admin_*`
 * tables, its cookies carry their own prefix, and it signs with its own
 * secret.
 *
 * Only an email with an `admin_account` row gets past the first step: anyone
 * else is told plainly that the email has no admin access and never reaches
 * the code screen. That answer does reveal who is on the team, so how often a
 * client may ask is capped per IP. Sign-up is also disabled on the instance
 * itself, so even a call that skipped this check could never create an
 * account or sign in an unknown email.
 *
 * Its HTTP router is intentionally not mounted. The only ways in are the three
 * calls below, exposed by AdminAuthController.
 */
@Injectable()
export class AdminAuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminAuthService.name);
  private auth?: AdminAuthInstance;
  private initPromise?: Promise<void>;
  private pool?: Pool;
  private readonly recentSends = new Map<string, number[]>();
  private readonly recentLookups = new Map<string, number[]>();

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit() {
    await this.getAuth();
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  async sendCode(email: string, clientIp: string) {
    // Better Auth's own rate limiter only guards its HTTP router, which is not
    // mounted here, so both limits are kept in-process. The per-IP one runs
    // first: it is a map lookup, and a throttled caller costs nothing more.
    const lookupMax = this.configService.get<number>("adminAuth.lookupMaxPerIp") ?? 10;
    if (!takeSlot(this.recentLookups, clientIp, lookupMax, LOOKUP_WINDOW_MS)) {
      throw tooManyRequests("Too many sign-in attempts. Please wait a few minutes and try again.");
    }

    const auth = await this.getAuth();

    if (!(await this.adminExists(email))) {
      throw new ForbiddenException({
        code: "ADMIN_NOT_FOUND",
        message: "This email doesn't have admin access.",
      });
    }

    const resendMax = this.configService.get<number>("adminAuth.resendMax") ?? 3;
    if (!takeSlot(this.recentSends, email, resendMax, RESEND_WINDOW_MS)) {
      throw tooManyRequests("Too many codes requested. Please wait a minute and try again.");
    }

    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });

    return { success: true };
  }

  // Called only after getAuth(), which creates the pool.
  private async adminExists(email: string) {
    const { rowCount } = await this.pool!.query(
      `SELECT 1 FROM "admin_account" WHERE lower("email") = lower($1) LIMIT 1`,
      [email],
    );

    return (rowCount ?? 0) > 0;
  }

  async verifyCode(
    input: { email: string; code: string },
    request: Request,
    response: ExpressResponse,
  ) {
    const auth = await this.getAuth();
    const authResponse = await auth.api.signInEmailOTP({
      asResponse: true,
      body: { email: input.email, otp: input.code },
      headers: headersFromRequest(request),
    });

    forwardSetCookie(authResponse.headers, response);

    // An unknown email surfaces as the same INVALID_OTP as a wrong code, so a
    // failed verify reveals nothing about which addresses have accounts.
    if (!authResponse.ok) {
      throw new UnauthorizedException({
        code: "INVALID_OTP",
        message: "Invalid or expired code.",
      });
    }

    response.status(200).json({ redirectTo: "/admin" });
  }

  async signOut(request: Request, response: ExpressResponse) {
    const auth = await this.getAuth();
    const authResponse = await auth.api.signOut({
      asResponse: true,
      headers: headersFromRequest(request),
    });

    forwardSetCookie(authResponse.headers, response);
    response.status(200).json({ redirectTo: "/admin/sign-in" });
  }

  async getSession(
    request: Request,
    response: ExpressResponse,
  ): Promise<AdminIdentity | null> {
    const auth = await this.getAuth();
    const { headers, response: session } = await auth.api.getSession({
      headers: headersFromRequest(request),
      returnHeaders: true,
    });

    // Carries the sliding-expiry refresh back to the browser.
    forwardSetCookie(headers, response);

    return session?.user ?? null;
  }

  private async getAuth() {
    this.initPromise ??= this.createAuth();
    await this.initPromise;

    if (!this.auth) {
      throw new InternalServerErrorException({
        code: "ADMIN_AUTH_NOT_INITIALIZED",
        message: "Admin authentication is not initialized.",
      });
    }

    return this.auth;
  }

  private async createAuth() {
    const [{ betterAuth }, { emailOTP }] = await Promise.all([
      importEsm<BetterAuthModule>("better-auth"),
      importEsm<BetterAuthPluginsModule>("better-auth/plugins"),
    ]);

    const databaseUrl =
      this.configService.get<string>("database.url") ??
      "postgresql://postgres:postgres@localhost:5432/contentual";
    const useSsl = this.configService.get<boolean>("database.ssl") ?? false;
    const sessionHours =
      this.configService.get<number>("adminAuth.sessionHours") ?? 12;

    // A handful of team members: a small pool of its own keeps admin traffic
    // from ever competing with product auth for connections.
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 3,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    });

    this.auth = betterAuth({
      appName: "Contentual Admin",
      baseURL:
        this.configService.get<string>("adminAuth.baseUrl") ??
        "http://localhost:3001/api/admin-auth",
      database: this.pool,
      secret: this.getSecret(),
      trustedOrigins:
        this.configService.get<string[]>("auth.trustedOrigins") ?? [],
      user: { modelName: "admin_account" },
      account: { modelName: "admin_identity" },
      verification: { modelName: "admin_verification" },
      session: {
        modelName: "admin_session",
        expiresIn: sessionHours * 60 * 60,
        updateAge: 60 * 60,
        // No cookie cache: deleting an admin_account (or its sessions) must
        // lock that person out on their very next request.
        cookieCache: { enabled: false },
      },
      advanced: { cookiePrefix: ADMIN_COOKIE_PREFIX },
      plugins: [
        emailOTP({
          allowedAttempts: OTP_ALLOWED_ATTEMPTS,
          disableSignUp: true,
          expiresIn: OTP_EXPIRES_SECONDS,
          otpLength: 6,
          resendStrategy: "rotate",
          storeOTP: "hashed",
          sendVerificationOTP: async ({ email, otp }: { email: string; otp: string }) => {
            const result = await this.emailService.sendLoginCode({
              code: otp,
              expiresInMinutes: Math.ceil(OTP_EXPIRES_SECONDS / 60),
              to: email,
            });

            // Logged, not thrown: failing the request only for real accounts
            // would tell the caller which emails exist.
            if (!result.ok) {
              this.logger.error(`Admin sign-in code email failed: ${result.error}`);
            }
          },
        }),
      ],
    });
  }

  private getSecret() {
    const configured = this.configService.get<string>("adminAuth.secret");

    if (configured) {
      return configured;
    }

    if (process.env.NODE_ENV === "production") {
      throw new InternalServerErrorException({
        code: "ADMIN_AUTH_SECRET_MISSING",
        message: "ADMIN_AUTH_SECRET is required in production.",
      });
    }

    return DEV_SECRET;
  }
}

function headersFromRequest(request: Request) {
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

function forwardSetCookie(headers: Headers, response: ExpressResponse) {
  const cookies =
    (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    [];

  for (const cookie of cookies) {
    response.append("Set-Cookie", cookie);
  }
}

function tooManyRequests(message: string) {
  return new HttpException({ code: "TOO_MANY_ATTEMPTS", message }, HttpStatus.TOO_MANY_REQUESTS);
}

/**
 * Records an attempt under `key` if it is within `max` per `windowMs`.
 *
 * Keys whose attempts have all aged out are dropped, and once the map passes
 * PRUNE_AT every such key is swept, so a caller rotating addresses cannot grow
 * it without bound.
 */
function takeSlot(
  log: Map<string, number[]>,
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  if (log.size > PRUNE_AT) {
    for (const [staleKey, attempts] of log) {
      if (attempts.every((at) => now - at >= windowMs)) log.delete(staleKey);
    }
  }

  const recent = (log.get(key) ?? []).filter((at) => now - at < windowMs);

  if (recent.length >= max) {
    log.set(key, recent);
    return false;
  }

  recent.push(now);
  log.set(key, recent);
  return true;
}

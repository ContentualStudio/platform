import { NextResponse } from "next/server";
import { REFERRAL_COOKIE } from "@/schemas/billing.schema";

const CODE_PATTERN = /^[a-z0-9]{4,32}$/i;
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

/**
 * `/r/<code>`: remembers the referral code and sends the visitor to sign-up.
 * `ReferralCapture` attaches it after sign-in, so the cookie is script-readable
 * (the code is public, not a secret).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const destination = new URL("/auth/signup", request.url);
  const response = NextResponse.redirect(destination);

  if (CODE_PATTERN.test(code)) {
    response.cookies.set({
      name: REFERRAL_COOKIE,
      value: code.toLowerCase(),
      maxAge: THIRTY_DAYS_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: destination.protocol === "https:",
    });
  }

  return response;
}

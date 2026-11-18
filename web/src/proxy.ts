import { NextResponse } from "next/server";

// Keep protected-route decisions DB-backed in the route pages. Better Auth's
// cookie cache is intentionally short-lived and can lag the profile row during
// OAuth/onboarding redirects, which makes proxy-level dashboard/onboarding
// routing prone to stale bounces.
export default function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/onboarding/:path*", "/dashboard/:path*"],
};

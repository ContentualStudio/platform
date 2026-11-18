import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Admin · Contentual",
    template: "%s · Contentual Admin",
  },
  robots: { index: false, follow: false },
};

/**
 * Root of the internal admin. Sits outside `(protected)` on purpose: the
 * admin has its own accounts and session, and must not inherit the product's
 * ProfileGate, notifications or referral capture.
 */
export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

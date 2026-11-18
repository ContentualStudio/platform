import type { Metadata } from "next";
import { AdminSignIn } from "@/components/admin/admin-sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function AdminSignInPage() {
  return <AdminSignIn />;
}

import { redirect } from "next/navigation";
import { getAdminServer } from "@/lib/admin/admin-session";

/**
 * Request-time half of the admin console layout: sends anyone without an
 * admin session to /admin/sign-in. Renders nothing, so it sits behind a
 * `null` fallback without leaving a hole in the shell.
 *
 * Presentation only. Every admin api endpoint enforces the same session on
 * its own, so a page that slipped past this gate would still get no data.
 */
export async function AdminGate() {
  const session = await getAdminServer();

  if (session.status === "signed-out") {
    redirect("/admin/sign-in");
  }

  return null;
}

import { ProtectedShell } from "@/components/dashboard/protected-shell";

// Challenge setup and settings render their own full-screen chrome, so they get
// the sidebar without the persistent header. Which routes show the header is
// now a route-group decision rather than a `usePathname` check in a client
// component — the shell stays static and prefetchable either way.
export default function SetupShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedShell>{children}</ProtectedShell>;
}

import { ProtectedShell } from "@/components/dashboard/protected-shell";

export default function ImmersiveShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedShell noPadding>{children}</ProtectedShell>;
}

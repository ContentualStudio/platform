import { UserX } from "lucide-react";
import Link from "next/link";
import { EmptyState, emptyStateActionClassName } from "@/components/admin/empty-state";

// Rendered inside the admin shell when the user id matches no account, rather
// than dropping to the app's bare root 404.
export default function AdminUserNotFound() {
  return (
    <EmptyState
      action={
        <Link className={emptyStateActionClassName} href="/admin/users">
          Back to users
        </Link>
      }
      bordered
      description="There's no account with that id. It may have been deleted."
      heading="h1"
      icon={UserX}
      title="User not found"
    />
  );
}

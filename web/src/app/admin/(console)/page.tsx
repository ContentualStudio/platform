import { redirect } from "next/navigation";

// Users is the admin's front door.
export default function AdminHomePage() {
  redirect("/admin/users");
}

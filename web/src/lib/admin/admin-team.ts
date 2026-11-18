import { z } from "zod";
import { adminServerGet } from "@/lib/admin/admin-api";
import { adminTeamMemberSchema } from "@/schemas/admin-team.schema";

export function getAdminTeam() {
  return adminServerGet("/admin/team", z.object({ members: z.array(adminTeamMemberSchema) }));
}

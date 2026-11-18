import { Controller, Get, UseGuards } from "@nestjs/common";
import type { AdminIdentity } from "./admin-auth.service";
import { AdminSessionGuard, CurrentAdmin } from "./admin-session.guard";

@Controller("admin")
@UseGuards(AdminSessionGuard)
export class AdminController {
  /**
   * The admin shell's gate read. A 401 here is what the web turns into the
   * redirect to /admin/sign-in.
   */
  @Get("me")
  me(@CurrentAdmin() admin: AdminIdentity) {
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      image: admin.image,
    };
  }
}

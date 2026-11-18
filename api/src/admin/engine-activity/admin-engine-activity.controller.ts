import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminSessionGuard } from "../admin-session.guard";
import { AdminEngineActivityService } from "./admin-engine-activity.service";
import { parseFiringFilters } from "./engine-activity";

// Read-only by design: there is deliberately no write endpoint here.
@Controller("admin/engine-activity")
@UseGuards(AdminSessionGuard)
export class AdminEngineActivityController {
  constructor(private readonly engineActivity: AdminEngineActivityService) {}

  @Get("firings")
  firings(@Query("rule") rule?: unknown, @Query("event") event?: unknown) {
    return this.engineActivity.firings(parseFiringFilters({ rule, event }));
  }

  @Get("rules")
  rules() {
    return this.engineActivity.rules();
  }

  @Get("cooldown")
  cooldown() {
    return this.engineActivity.cooldown();
  }
}

import { Controller, Get, UseGuards } from "@nestjs/common";
import { AdminSessionGuard } from "../admin-session.guard";
import { AdminAnalyticsService } from "./admin-analytics.service";

@Controller("admin/analytics")
@UseGuards(AdminSessionGuard)
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get("programme-completion")
  programmeCompletion() {
    return this.analytics.programmeCompletion();
  }
}

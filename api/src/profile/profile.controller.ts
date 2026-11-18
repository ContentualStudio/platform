import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser, SessionGuard } from "../auth/guards/session.guard";
import { parseWithSchema } from "../common/zod-http";
import {
  PRODUCT_ANALYTICS,
  type ProductAnalytics,
} from "../observability/product-analytics.port";
import { productEventTokens } from "../observability/product-events";
import {
  notificationPreferencesSchema,
  profileUpdateSchema,
  stage1PartialAnswersSchema,
  themePreferenceSchema,
} from "./profile.schemas";
import { ProfileService } from "./profile.service";

@Controller("profile")
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
    @Inject(PRODUCT_ANALYTICS)
    private readonly analytics: ProductAnalytics,
  ) {}

  @Get("me")
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.getProfile(user);
  }

  @Patch("me")
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const payload = parseWithSchema(
      profileUpdateSchema,
      body,
      "INVALID_PROFILE_PAYLOAD",
      "The profile details are invalid.",
    );

    return this.profileService.updateProfile(user, payload);
  }

  @Patch("me/notifications")
  async updateNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const payload = parseWithSchema(
      notificationPreferencesSchema,
      body,
      "INVALID_NOTIFICATION_PREFERENCES",
      "The notification preferences are invalid.",
    );

    return this.profileService.updateNotificationPreferences(user, payload);
  }

  @Patch("me/theme")
  async updateThemePreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const payload = parseWithSchema(
      themePreferenceSchema,
      body,
      "INVALID_THEME_PREFERENCE",
      "The theme preference is invalid.",
    );

    return this.profileService.updateThemePreference(user, payload);
  }

  /**
   * Serves the signed-in user's avatar bytes.
   *
   * The URL stored on the user row points here, so the browser requests it
   * like any other image — same-origin through the web proxy, which is what
   * carries the session cookie and lets this stay behind the guard. The
   * cache-busting term lives in the URL's query string, so the response can be
   * revalidated with an ETag rather than refetched.
   */
  @Get("me/avatar")
  async getAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const avatar = await this.profileService.findAvatar(user.id);

    if (!avatar) {
      response.status(404).end();
      return;
    }

    const etag = `"${avatar.etag}"`;

    response.setHeader("Content-Type", avatar.contentType);
    response.setHeader("ETag", etag);
    // Private: an avatar is personal data and must not be held by a shared
    // cache. `must-revalidate` keeps the browser asking, which the ETag then
    // answers with a 304 in the common case.
    response.setHeader("Cache-Control", "private, max-age=0, must-revalidate");

    if (request.headers["if-none-match"] === etag) {
      response.status(304).end();
      return;
    }

    response.setHeader("Content-Length", String(avatar.bytes.byteLength));
    response.status(200).send(avatar.bytes);
  }

  @Post("me/avatar")
  @UseInterceptors(FileInterceptor("file"))
  async uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile()
    file?: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    if (!file) {
      throw new BadRequestException("Choose an avatar image to upload.");
    }

    return this.profileService.uploadAvatar(user, file);
  }

  @Delete("me/avatar")
  async removeAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.removeAvatar(user);
  }

  @Post("onboarding/stage1")
  async saveStage1(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const payload = parseWithSchema(
      stage1PartialAnswersSchema,
      body,
      "INVALID_STAGE1_PAYLOAD",
      "The onboarding answers are invalid.",
    );

    const summary = await this.profileService.saveStage1Answers(
      user,
      payload,
    );

    // The session's cached cookie was built at the top of this request,
    // before the write above. Refresh it now so any lightweight session
    // readers see the completion state immediately.
    if (summary.onboardingCompleted && !user.onboardingCompleted) {
      await this.authService.refreshSessionCookieCache(request, response);
    }

    // Which questions were answered, never the answers: the answers are profile
    // data, while the field names are what shows where people drop out of
    // onboarding. `completed` carries the step that finishes the stage.
    this.analytics.capture({
      identity: { userId: user.id },
      event: productEventTokens.onboardingStage1Saved,
      properties: {
        answered: Object.keys(payload).sort(),
        completed: summary.onboardingCompleted,
      },
    });

    return summary;
  }
}

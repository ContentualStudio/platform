import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  InternalServerErrorException,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { emailSchema, otpCodeSchema } from "../auth/auth.schemas";
import { clientIp } from "../common/client-ip";
import { parseWithSchema } from "../common/zod-http";
import { AdminAuthService } from "./admin-auth.service";

const sendCodeSchema = z.object({ email: emailSchema }).strict();
const verifyCodeSchema = z
  .object({ email: emailSchema, code: otpCodeSchema })
  .strict();

function parsePayload<T>(body: unknown, schema: z.ZodType<T>): T {
  return parseWithSchema(
    schema,
    body,
    "INVALID_ADMIN_AUTH_PAYLOAD",
    "The admin sign-in request payload is invalid.",
  );
}

function toHttpException(error: unknown, code: string) {
  return error instanceof HttpException
    ? error
    : new InternalServerErrorException({
        code,
        message: "Admin sign-in failed.",
      });
}

@Controller("admin-auth")
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  @Post("send-code")
  @HttpCode(200)
  async sendCode(@Body() body: unknown, @Req() request: Request) {
    const { email } = parsePayload(body, sendCodeSchema);

    try {
      return await this.adminAuth.sendCode(email, clientIp(request));
    } catch (error) {
      throw toHttpException(error, "ADMIN_SEND_CODE_FAILED");
    }
  }

  @Post("verify-code")
  async verifyCode(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const payload = parsePayload(body, verifyCodeSchema);

    try {
      await this.adminAuth.verifyCode(payload, request, response);
    } catch (error) {
      throw toHttpException(error, "ADMIN_VERIFY_CODE_FAILED");
    }
  }

  @Post("sign-out")
  async signOut(@Req() request: Request, @Res() response: Response) {
    try {
      await this.adminAuth.signOut(request, response);
    } catch (error) {
      throw toHttpException(error, "ADMIN_SIGN_OUT_FAILED");
    }
  }
}

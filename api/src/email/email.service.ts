import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  EmailSendResult,
  SendLoginCodeInput,
  SendTransactionalEmailInput,
} from "./email.types";
import { adminInviteTemplate } from "./templates/admin-invite.template";
import { loginCodeTemplate } from "./templates/login-code.template";
import { dailyTaskNoticeTemplate } from "./templates/daily-task-notice.template";

interface ResendSendResponse {
  id?: string;
  message?: string;
  name?: string;
}

@Injectable()
export class EmailService {
  private readonly apiKey?: string;
  private readonly fromEmail?: string;
  private readonly replyToEmail?: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>("email.resendApiKey");
    this.fromEmail = this.configService.get<string>("email.fromEmail");
    this.replyToEmail = this.configService.get<string>("email.replyToEmail");
  }

  async sendLoginCode(input: SendLoginCodeInput): Promise<EmailSendResult> {
    const template = loginCodeTemplate({
      code: input.code,
      expiresInMinutes: input.expiresInMinutes,
    });

    return this.sendTransactionalEmail({
      to: input.to,
      ...template,
    });
  }

  async sendAdminInvite(input: {
    to: string;
    invitedBy: string;
    signInUrl: string;
  }): Promise<EmailSendResult> {
    return this.sendTransactionalEmail({
      to: input.to,
      ...adminInviteTemplate({ invitedBy: input.invitedBy, signInUrl: input.signInUrl }),
    });
  }

  async sendDailyTaskNotice(input: {
    to: string;
    taskTitle: string;
    taskSummary?: string;
    actionUrl: string;
    idempotencyKey?: string;
  }): Promise<EmailSendResult> {
    const template = dailyTaskNoticeTemplate({
      taskTitle: input.taskTitle,
      ...(input.taskSummary !== undefined
        ? { taskSummary: input.taskSummary }
        : {}),
      actionUrl: input.actionUrl,
    });

    return this.sendTransactionalEmail({
      to: input.to,
      ...template,
      ...(input.idempotencyKey !== undefined
        ? { idempotencyKey: input.idempotencyKey }
        : {}),
    });
  }

  async sendTransactionalEmail(
    input: SendTransactionalEmailInput,
  ): Promise<EmailSendResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        error: "RESEND_API_KEY is not configured",
      };
    }

    if (!this.fromEmail) {
      return {
        ok: false,
        error: "RESEND_FROM_EMAIL is not configured",
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(input.idempotencyKey !== undefined
            ? { "Idempotency-Key": input.idempotencyKey }
            : {}),
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
          reply_to: input.replyTo ?? this.replyToEmail,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | ResendSendResponse
        | undefined;

      if (!response.ok) {
        return {
          ok: false,
          statusCode: response.status,
          error:
            payload?.message ??
            payload?.name ??
            `Resend request failed with status ${response.status}`,
        };
      }

      if (!payload?.id) {
        return {
          ok: false,
          statusCode: response.status,
          error: "Resend did not return an email id",
        };
      }

      return {
        ok: true,
        id: payload.id,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown email error",
      };
    }
  }
}

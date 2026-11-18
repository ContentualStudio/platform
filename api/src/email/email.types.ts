export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface SendTransactionalEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /**
   * Deterministic per logical send. Resend keeps keys for 24 hours and
   * returns the original response on replay, so a retried morning cannot
   * deliver the same notice twice even if the local delivery record is
   * missing. Must be unique per send and at most 256 characters.
   */
  idempotencyKey?: string;
}

export type EmailSendResult =
  | {
      ok: true;
      id: string;
    }
  | {
      ok: false;
      error: string;
      statusCode?: number;
    };

export interface SendLoginCodeInput {
  to: string;
  code: string;
  expiresInMinutes: number;
}

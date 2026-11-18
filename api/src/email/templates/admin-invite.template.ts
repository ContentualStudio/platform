import { EmailTemplate } from "../email.types";
import { escapeHtml } from "./escape-html";

/**
 * Tells someone they were added to the internal admin. There is no token in
 * it: the account already exists, and they sign in with an emailed code like
 * every other admin.
 */
export function adminInviteTemplate(input: {
  invitedBy: string;
  signInUrl: string;
}): EmailTemplate {
  const subject = "You've been added to the Contentual admin";
  const text = [
    `${input.invitedBy} added you to the Contentual admin.`,
    `Sign in with this email address at ${input.signInUrl} — we'll send you a 6-digit code.`,
    "If you weren't expecting this, you can ignore this email.",
  ].join("\n\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #171717; line-height: 1.6;">
      <p>${escapeHtml(input.invitedBy)} added you to the Contentual admin.</p>
      <p>Sign in with this email address — we'll send you a 6-digit code.</p>
      <p>
        <a href="${escapeHtml(input.signInUrl)}"
           style="display: inline-block; background: #171717; color: #ffffff; padding: 10px 18px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Sign in to the admin
        </a>
      </p>
      <p>If you weren't expecting this, you can ignore this email.</p>
    </div>
  `;

  return { subject, html, text };
}

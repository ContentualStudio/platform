import { EmailTemplate } from "../email.types";
import { escapeHtml } from "./escape-html";

export function loginCodeTemplate(input: {
  code: string;
  expiresInMinutes: number;
}): EmailTemplate {
  const subject = "Your Contentual login code";
  const text = [
    `Your Contentual login code is ${input.code}.`,
    `This code expires in ${input.expiresInMinutes} minutes.`,
    "If you did not request this code, you can safely ignore this email.",
  ].join("\n\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #171717; line-height: 1.6;">
      <p>Your Contentual login code is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.12em;">${escapeHtml(input.code)}</p>
      <p>This code expires in ${input.expiresInMinutes} minutes.</p>
      <p>If you did not request this code, you can safely ignore this email.</p>
    </div>
  `;

  return {
    subject,
    html,
    text,
  };
}

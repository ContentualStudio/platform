import type { EmailTemplate } from "../email.types";
import { escapeHtml } from "./escape-html";

export function dailyTaskNoticeTemplate(input: {
  taskTitle: string;
  taskSummary?: string;
  actionUrl: string;
}): EmailTemplate {
  const title = input.taskTitle.trim();
  const subject = `Today's task: ${title}`;
  const summary = input.taskSummary?.trim();

  const text = [
    "Your daily challenge is ready.",
    `Today's task: ${title}.`,
    ...(summary ? [summary] : []),
    `Open today's task: ${input.actionUrl}`,
  ].join("\n\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #171717; line-height: 1.6;">
      <p>Your daily challenge is ready.</p>
      <p style="font-size: 20px; font-weight: 700;">${escapeHtml(title)}</p>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
      <p>
        <a href="${escapeHtml(input.actionUrl)}"
           style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 999px; font-weight: 600;">
          Open today's task
        </a>
      </p>
    </div>
  `;

  return {
    subject,
    html,
    text,
  };
}

import nodemailer from "nodemailer";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Only populated by the in-memory transport (tests). */
  readonly outbox: MailMessage[];
}

export function createMailer(config: AppConfig, log: FastifyBaseLogger): Mailer {
  const outbox: MailMessage[] = [];
  switch (config.emailTransport) {
    case "smtp": {
      const transport = nodemailer.createTransport(config.env.SMTP_URL);
      return {
        outbox,
        async send(m) {
          await transport.sendMail({ from: config.env.EMAIL_FROM, ...m });
        },
      };
    }
    case "memory":
      return {
        outbox,
        async send(m) {
          outbox.push(m);
        },
      };
    case "log":
    default:
      // Development only (refused in production by loadConfig). Prints the email, including
      // one-time links, to the API log so a developer can complete verification flows locally.
      return {
        outbox,
        async send(m) {
          log.info({ mail: { to: m.to, subject: m.subject } }, `\n──── email (dev log transport) ────\nTo: ${m.to}\nSubject: ${m.subject}\n\n${m.text}\n──────────────────────────────────`);
        },
      };
  }
}

export function emailLayout(title: string, body: string, cta?: { label: string; url: string }): { text: string; html: string } {
  const text = `${title}\n\n${body}${cta ? `\n\n${cta.label}: ${cta.url}` : ""}\n\n— TestPilot AI`;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f6f7f9;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
<h1 style="font-size:18px;margin:0 0 16px">${esc(title)}</h1><p style="color:#374151;line-height:1.6">${esc(body)}</p>
${cta ? `<p><a href="${esc(cta.url)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${esc(cta.label)}</a></p>` : ""}
<p style="color:#9ca3af;font-size:12px;margin-top:32px">TestPilot AI</p></div></body></html>`;
  return { text, html };
}

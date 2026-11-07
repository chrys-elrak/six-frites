import nodemailer from "nodemailer";
import { env, isProd } from "../env.js";

export const mailEnabled = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

const transport = mailEnabled
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      requireTLS: true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** A link that turns these emails off, for the mail app's own unsubscribe button. */
  unsubscribe?: string;
}

/**
 * Sends an email, or does nothing when mail isn't set up. Outside production it goes to MAIL_REDIRECT_TO, with the
 * real address in an X-Original-To header, so nobody gets mail from a laptop. Returns the address it went to, or null
 * when it wasn't sent.
 */
export async function sendMail(mail: Mail) {
  const to = isProd ? mail.to : env.MAIL_REDIRECT_TO;
  if (!transport || !to) return null;
  await transport.sendMail({
    from: { name: env.MAIL_FROM_NAME, address: env.SMTP_USER! },
    to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: {
      ...(!isProd && { "X-Original-To": mail.to }),
      ...(mail.unsubscribe && { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }),
    },
  });
  return to;
}

export async function verifyMail() {
  if (!transport) throw new Error("Mail is not configured: set SMTP_HOST, SMTP_USER and SMTP_PASS");
  await transport.verify();
}

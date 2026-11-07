import nodemailer from "nodemailer";
import { env } from "../env.js";

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

export async function sendMail(to: string, subject: string, html: string, text?: string) {
  if (!transport) throw new Error("Mail is not configured: set SMTP_HOST, SMTP_USER and SMTP_PASS");
  return transport.sendMail({ from: { name: env.MAIL_FROM_NAME, address: env.SMTP_USER! }, to, subject, html, text });
}

export async function verifyMail() {
  if (!transport) throw new Error("Mail is not configured: set SMTP_HOST, SMTP_USER and SMTP_PASS");
  await transport.verify();
}

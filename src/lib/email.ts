// Sends emails through Gmail SMTP with an App Password (nodemailer).
// Where it's used: the admin Communications actions
// (src/lib/admin/user-actions.ts) and the "your email was changed" alert
// (confirmEmailChange in src/lib/account/actions.ts).
//
// SERVER ONLY: the Gmail App Password must never reach the browser. The
// settings come from .env.local (and Vercel's Environment Variables):
//   SMTP_HOST   smtp.gmail.com
//   SMTP_PORT   465 (secure) or 587
//   SMTP_USER   the Gmail address, e.g. block69cafe@gmail.com
//   SMTP_PASS   the 16-letter Google App Password (not the normal password)
//   EMAIL_FROM  who it's from, e.g. "Block 69 Cafe <block69cafe@gmail.com>"
//
// sendEmail() NEVER throws: a missing key, a wrong password or Gmail being
// down gives back { ok: false, error }, so a page can show a plain message
// instead of breaking.

import "server-only"; // never sent to the browser
import nodemailer, { type Transporter } from "nodemailer";

// What sendEmail() gives back.
export type EmailResult = { ok: true } | { ok: false; error: string };

// One email to send (plain text only, so it reads well in every app).
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string; // where the client's reply goes (the cafe's email)
};

// Shown when the SMTP keys aren't in .env.local yet.
export const EMAIL_NOT_SET_UP = "Email sending isn't set up yet (the SMTP keys are missing in .env.local).";

// The SMTP settings from the environment.
type SmtpSettings = { host: string; port: number; user: string; pass: string; from: string };

// Reads the SMTP settings.
// Takes: nothing. Gives back: the settings, or null if any key is missing.
function readSmtpSettings(): SmtpSettings | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER?.trim();
  // Google shows App Passwords with spaces ("abcd efgh ..."); they're not part of it
  const pass = process.env.SMTP_PASS?.replace(/\s/g, "");
  const from = process.env.EMAIL_FROM?.trim() || user;
  if (!host || !user || !pass || !from || !Number.isInteger(port)) return null;
  return { host, port, user, pass, from };
}

// One connection setup, made the first time an email is sent and then reused.
let transporter: Transporter | null = null;

// Gives back the nodemailer "transporter" (the thing that talks to Gmail).
// Takes: the SMTP settings. Gives back: the transporter.
function getTransporter(settings: SmtpSettings): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      // Port 465 starts encrypted; 587 upgrades to encryption (STARTTLS)
      secure: settings.port === 465,
      auth: { user: settings.user, pass: settings.pass },
      // Give up after a few seconds, so a page never hangs on a slow server
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

// Tells if the SMTP keys are filled in (pages can say so before sending).
// Takes: nothing. Gives back: true if every key is there.
export function emailIsSetUp(): boolean {
  return readSmtpSettings() !== null;
}

// Sends one email.
// Takes: to, subject, text and an optional reply-to address.
// Gives back: { ok: true }, or { ok: false, error } with a short reason.
// Never throws.
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const settings = readSmtpSettings();
  if (!settings) return { ok: false, error: EMAIL_NOT_SET_UP };

  try {
    await getTransporter(settings).sendMail({
      from: settings.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      replyTo: message.replyTo || undefined,
    });
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // The full reason goes to the server log; the page gets a short one
    console.error("Email was not sent:", reason);
    return { ok: false, error: shortReason(reason) };
  }
}

// Turns nodemailer's error into a short, plain reason.
// Takes: the error text. Gives back: one short sentence.
function shortReason(reason: string): string {
  if (/invalid login|username and password|535/i.test(reason)) {
    return "Gmail refused the login. Check SMTP_USER and the App Password (SMTP_PASS).";
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(reason)) {
    return "Couldn't reach the email server. Check the internet connection and SMTP_HOST / SMTP_PORT.";
  }
  if (/limit|quota|rate/i.test(reason)) {
    return "Gmail's sending limit was reached. Please try again later.";
  }
  return "The email server refused the email.";
}

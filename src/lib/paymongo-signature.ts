// Checks that a webhook message really came from PayMongo.
// Where it's used: the PayMongo webhook (src/app/api/paymongo/webhook/
// route.ts), and its unit test (tests/unit/paymongo-signature.test.mjs).
//
// How PayMongo signs a webhook (their "Securing a webhook" docs):
//   The request has a header like
//     Paymongo-Signature: t=1496734173,te=<64 hex characters>,li=
//   t  = when PayMongo sent it (seconds)
//   te = the signature for TEST mode, li = the signature for LIVE mode
//   The signature is HMAC-SHA256 of the text "<t>.<raw body>", made with our
//   webhook's secret key, written as hex.
// We make the same signature ourselves and compare. Anyone without the
// secret key can't make a matching one, and changing even one character of
// the body changes the signature.
//
// We are in TEST mode only (CLAUDE.md section 2), so we compare with "te".
//
// This file only uses Node's built-in crypto (no Next.js imports), so the
// unit test can load it directly. It is still server-only in practice: only
// the webhook route imports it.

import { createHmac, timingSafeEqual } from "node:crypto";

// Reads the parts of a Paymongo-Signature header.
// Takes: the header text, e.g. "t=1496734173,te=abc...,li=".
// Gives back: { t, te, li } (each "" if missing).
export function parseSignatureHeader(header: string): { t: string; te: string; li: string } {
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    // Split at the FIRST "=" only: "te=abc" -> ["te", "abc"]
    const at = piece.indexOf("=");
    if (at > 0) parts[piece.slice(0, at).trim()] = piece.slice(at + 1).trim();
  }
  return { t: parts.t ?? "", te: parts.te ?? "", li: parts.li ?? "" };
}

// Works out the signature PayMongo should have sent.
// Takes: the timestamp (t), the raw body text, and the webhook secret.
// Gives back: the HMAC-SHA256 as lowercase hex.
export function computeSignature(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

// Checks one webhook request.
// Takes: the raw body EXACTLY as received (before any JSON parsing), the
// Paymongo-Signature header (or null), and our webhook secret.
// Gives back: true only if the test-mode signature matches. Anything
// missing or wrong gives false.
export function isValidPaymongoSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const { t, te } = parseSignatureHeader(header);
  // t must be a number of seconds, te must be 64 hex characters
  if (!/^\d+$/.test(t) || !/^[0-9a-f]{64}$/i.test(te)) return false;

  const expected = Buffer.from(computeSignature(t, rawBody, secret), "hex");
  const received = Buffer.from(te.toLowerCase(), "hex");
  // timingSafeEqual compares without leaking (through timing) how many
  // characters matched. Both are 32 bytes here.
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// Signs short-lived Google deletion proofs used by the account action and OAuth callback.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const deleteGoogleIntent = "b69-delete-google-intent";
export const deleteGoogleProof = "b69-delete-google-proof";
export const deleteProofLifetime = 300;

// Creates a signed value tied to a verified user, purpose, and optional session.
export function signDeleteProof(purpose: string, userId: string, sessionId = ""): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Account deletion requires a Supabase server key.");
  const expires = Math.floor(Date.now() / 1000) + deleteProofLifetime;
  const signature = createHmac("sha256", key).update(JSON.stringify([purpose, userId, sessionId, expires])).digest("hex");
  return `${expires}.${signature}`;
}

// Validates a signed value against the supplied account and session while it is fresh.
export function verifyDeleteProof(value: string | undefined, purpose: string, userId: string, sessionId = ""): boolean {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || !value || !/^\d{10}\.[0-9a-f]{64}$/.test(value)) return false;

  const [expiry, signature] = value.split(".");
  const expires = Number(expiry);
  if (expires <= Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", key).update(JSON.stringify([purpose, userId, sessionId, expires])).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}

// Keeps proofs inaccessible to page scripts and available only on this site.
export const deleteProofCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: deleteProofLifetime,
} as const;

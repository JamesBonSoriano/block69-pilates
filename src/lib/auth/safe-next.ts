// Checks the "next" part of a web address (e.g. /login?next=/account) before
// we send someone there after they log in.
// Where it's used: src/proxy.ts, the login / sign-up actions, the login and
// sign-up pages, and the email link route (/auth/confirm).
//
// Why it matters (security): without this check, a bad person could send
// someone a link like  /login?next=https://fake-block69.com  and our own login
// page would forward them to the fake site after they log in. This is called
// an "open redirect". We only ever allow paths on OUR site.

// A made-up address used only to test where a path would really lead.
// (".invalid" is reserved, so it can never be a real website.)
const TEST_ORIGIN = "http://our-site.invalid";

// Makes sure a "next" value is a safe path on our own website.
// Takes: whatever was in the address or form (may be missing or a list).
// Gives back: the path (e.g. "/account?tab=1") if it's safe, otherwise null.
//
// Safe means: it starts with ONE "/" (so "//evil.com", which browsers treat
// as another website, is refused), it has no backslashes or hidden control
// characters (some browsers turn "\" into "/"), and it really stays on our site.
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) {
    return null;
  }

  // Must start with exactly one slash
  if (!value.startsWith("/") || value.startsWith("//")) return null;

  // No backslashes or control characters (tabs, new lines, ...) anywhere
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;

  // Last check: let the browser's own URL rules work out where it leads.
  // If it would leave our site, refuse it.
  let url: URL;
  try {
    url = new URL(value, TEST_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== TEST_ORIGIN) return null;

  return url.pathname + url.search + url.hash;
}

// Reads one value from a page's search params (?next=...).
// Takes: the value Next.js gives (a text, a list of texts, or nothing).
// Gives back: the first text, or undefined.
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

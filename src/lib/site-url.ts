// The website's own address (e.g. http://localhost:3000 while developing).
// Where it's used: the sign-up and forgot-password actions, to build the
// links Supabase puts in its emails.
//
// It comes from NEXT_PUBLIC_SITE_URL in .env.local (on Vercel, it's set in
// the project's settings). We never build it from the visitor's request,
// because a request can lie about which website it was sent to.

// Gives back the site address with no "/" at the end.
// Takes: nothing.
// Gives back: e.g. "http://localhost:3000".
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

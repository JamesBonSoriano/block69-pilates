// The page Supabase's email links open: /auth/confirm
// Where it's used: the "Confirm your email" and "Reset your password" emails.
//
// It checks the one-time code in the link with Supabase. If it's good,
// Supabase logs the person in (saves the login cookies) and we send them on:
//   - password reset links      -> /reset-password (to choose a new password)
//   - email confirmation links  -> the "next" page, or My Account
// If the link is wrong, old or already used, they get a clear message.
//
// It understands two kinds of link:
//   1. ?code=...  Supabase's DEFAULT link ({{ .ConfirmationURL }}). This is
//      what our emails use NOW: the templates are locked until we set up our
//      own email sender in Phase E. The email link first goes to Supabase,
//      which then sends the person here with a one-time "code". We swap the
//      code for a login using a secret "verifier" that was saved in a cookie
//      when they asked for the email. So the link only works in the SAME
//      browser that asked for it.
//   2. ?token_hash=...&type=...  The link we switch the templates to in
//      Phase E. It works even if the email is opened on a different phone or
//      browser, because it needs no saved cookie.

import { isAuthPKCECodeVerifierMissingError, type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";

// Why a link didn't work (decides which message the person sees).
type LinkProblem = "link-expired" | "other-browser";

// Runs when someone opens the email link.
// Takes: the request (its address holds the code, the link type and "next").
// Gives back: nothing; it always redirects to another page.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  // Newer Supabase versions add "sb_flow_id" to default links, naming which
  // saved verifier belongs to this email (if someone asked for several)
  const flowId = params.get("sb_flow_id");
  // Only ever a path on our own site (stops "open redirect" tricks)
  const next = safeNextPath(params.get("next"));

  // Is this a password reset link? (token links say type=recovery; default
  // code links carry next=/reset-password, set by requestPasswordReset)
  const isPasswordReset = type === "recovery" || next === "/reset-password";

  const supabase = await createClient();
  // null = it worked; otherwise what went wrong. A link with no code at all
  // (e.g. Supabase sent ?error_code=otp_expired because the link was too old)
  // counts as expired.
  let problem: LinkProblem | null = "link-expired";

  if (tokenHash && type) {
    // Kind 2: check the one-time code with Supabase (logs them in if good)
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    problem = error ? "link-expired" : null;
  } else if (code) {
    // Kind 1: swap the code for a login, using the verifier saved in this
    // browser's cookies when they asked for the email
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (!error) {
      problem = null;
    } else if (isAuthPKCECodeVerifierMissingError(error)) {
      // No saved verifier: the link was opened in a different browser or
      // phone from the one that asked for it
      problem = "other-browser";
    }
  }

  if (problem) {
    // Bad link: send them where they can ask for a new one (or log in)
    redirect(
      isPasswordReset ? `/forgot-password?error=${problem}` : `/login?error=${problem}`,
    );
  }

  redirect(isPasswordReset ? "/reset-password" : (next ?? "/account"));
}

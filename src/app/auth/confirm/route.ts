// The page Supabase's email links open: /auth/confirm
// Where it's used: the "Confirm your email" and "Reset your password" emails,
// and the way back from Google sign-in (Change 17, ?flow=google, see
// signInWithGoogle() in src/lib/auth/actions.ts).
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
//
// GOOGLE (?flow=google&code=...): the same code swap as kind 1. Then, like
// the password login (logInThrough in src/lib/auth/actions.ts):
//   - a deactivated account is logged straight back out (?error=deactivated),
//     except a client who turned it off themselves: they go to /reactivate
//   - an ADMIN account is logged straight back out: staff use /admin/login
//     (?error=admin-google)
//   - a client with no mobile number or birthday yet (always true for a new
//     Google account) goes to "Finish your profile" first, then to "next"
//   - if Google or Supabase said no (they pressed Cancel, or Google sign-in
//     isn't set up), /login?error=google-failed explains it

import { isAuthPKCECodeVerifierMissingError, type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { FINISH_PROFILE_PATH, reactivatePath } from "@/lib/auth/user";
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
  // Coming back from Google sign-in?
  const isGoogle = params.get("flow") === "google";

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

  if (isGoogle) {
    // Google: its own messages and checks (see the top of this file)
    if (problem) redirect("/login?error=google-failed");
    redirect(await afterGoogleLogin(supabase, next));
  }

  if (problem) {
    // Bad link: send them where they can ask for a new one (or log in)
    redirect(
      isPasswordReset ? `/forgot-password?error=${problem}` : `/login?error=${problem}`,
    );
  }

  redirect(isPasswordReset ? "/reset-password" : (next ?? "/account"));
}

// The checks after a Google login worked (the person is logged in now).
// Takes: the logged-in Supabase client, and the safe "next" path (or null).
// Gives back: where to send them. Deactivated and admin accounts are logged
// out first (only this browser).
async function afterGoogleLogin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  next: string | null,
): Promise<string> {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return "/login?error=google-failed";

  // Their profile (Row Level Security: only their own row). A brand-new
  // Google account's row was just made by the sign-up trigger.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_active, self_deactivated_at, mobile, birthday")
    .eq("id", userId)
    .maybeSingle();
  // Is it an ACTIVE admin? (the database's rule, migration 2)
  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");

  if (error || roleError) {
    await supabase.auth.signOut({ scope: "local" });
    return "/login?error=google-failed";
  }
  if (!profile?.is_active) {
    // They turned it off themselves (Version 1.4): stay logged in and ask
    // "Welcome back! Reactivate your account?"
    if (profile?.self_deactivated_at) return reactivatePath(next);
    await supabase.auth.signOut({ scope: "local" });
    return "/login?error=deactivated";
  }
  if (isAdmin === true) {
    // Staff use the admin login page (Revisions part 1, item 1)
    await supabase.auth.signOut({ scope: "local" });
    return "/login?error=admin-google";
  }

  // Missing details: ask for them first, then carry on to "next" (or Home)
  const goTo = next ?? "/";
  if (!profile.mobile || !profile.birthday) {
    return `${FINISH_PROFILE_PATH}?next=${encodeURIComponent(goTo)}`;
  }
  return goTo;
}

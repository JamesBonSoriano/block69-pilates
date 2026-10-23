"use server";
// Server Actions for logging in and out, signing up and passwords.
// Where it's used: the forms on /login, /admin/login, /signup,
// /forgot-password and /reset-password, and every Log out button.
//
// "use server" = these functions run ONLY on our server. The browser just
// sends the form to them. So the checks here can't be skipped by someone
// editing the page in their browser, and the login cookies are set safely.
//
// Each form action takes the previous form state (from React's
// useActionState) and the form's data, and gives back a new AuthFormState,
// or sends the person to another page with redirect().

import { redirect } from "next/navigation";
import {
  DEACTIVATED_MESSAGE,
  MIN_PASSWORD_LENGTH,
  RESET_EMAIL_SENT_MESSAGE,
  friendlyAuthError,
} from "@/lib/auth/errors";
import type { AuthFormState } from "@/lib/auth/form-state";
import {
  ADMIN_LOGIN_PATH,
  CLIENT_LOGIN_PATH,
  isWrongPortal,
  landingPath,
  type LoginPortal,
  wrongPortalMessage,
} from "@/lib/auth/login-portal";
import { safeNextPath } from "@/lib/auth/safe-next";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { isValidBirthday, isValidMobile } from "@/lib/validation";

// A simple "looks like an email" check (Supabase does the real check).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// LOG IN
// ---------------------------------------------------------------------------

// Logs a CLIENT in with their email and password (the /login page).
// Takes: the previous form state, and the form (email, password, and an
// optional hidden "next" path to go back to).
// Gives back: an error to show, or (on success) sends them on to "next" if
// it's a safe path on our site, otherwise to the Home page.
// An ADMIN account is refused here and pointed to /admin/login.
export async function logIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return logInThrough("client", formData);
}

// Logs an ADMIN in with their email and password (the /admin/login page).
// Takes: the previous form state, and the form (email, password, optional "next").
// Gives back: an error to show, or (on success) sends them on to "next" if
// it's an admin page, otherwise to the admin Dashboard (/admin).
// A CLIENT account is refused here and pointed to /login.
export async function adminLogIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  return logInThrough("admin", formData);
}

// ---------------------------------------------------------------------------
// SIGN UP
// ---------------------------------------------------------------------------

// Makes a new client account.
// Takes: the previous form state, and the form (full_name, mobile, birthday, email,
// password, optional hidden "next").
// Gives back: field errors, a general error, or a "check your email" message.
// If Supabase logs them in straight away ("Confirm email" is off), it sends
// them to "next" or the Home page instead.
//
// The profile row is made by the database itself: the handle_new_user()
// trigger (migration 1) copies full_name and mobile from the sign-up
// "metadata" below into public.profiles. The role is always "client".
export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const fullName = readText(formData, "full_name").replace(/\s+/g, " ");
  const mobile = readText(formData, "mobile");
  const birthday = readText(formData, "birthday");
  const email = readText(formData, "email").toLowerCase();
  const password = readPassword(formData, "password");
  const next = safeNextPath(formData.get("next"));
  const values = { full_name: fullName, mobile, birthday, email };

  // Check every field first, so the person sees all problems at once
  const fieldErrors: Record<string, string> = {};
  if (!fullName) {
    fieldErrors.full_name = "Please enter your full name.";
  } else if (fullName.length > 120) {
    fieldErrors.full_name = "Please use 120 characters or fewer.";
  }
  if (!isValidMobile(mobile)) {
    fieldErrors.mobile = "Please enter a valid mobile number, for example 0917 123 4567.";
  }
  // Required since Revisions part 1 (it can't be changed later by the client)
  if (!isValidBirthday(birthday)) {
    fieldErrors.birthday = "Please pick your birthday (a real date in the past).";
  }
  if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Please enter a valid email address.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Please use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Saved on the auth user as "metadata"; the sign-up trigger reads it
      data: { full_name: fullName, mobile, birthday },
      // Where the "confirm your email" link sends them (only used when
      // "Confirm email" is on). /auth/confirm logs them in, then goes to next.
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(next ?? "/")}`,
    },
  });

  if (error) {
    return { error: friendlyAuthError(error), values };
  }

  // When "Confirm email" is on, Supabase hides "email already used" (it
  // pretends to sign up, but the user has no login methods). Spot that here.
  if (data.user && data.user.identities?.length === 0) {
    return {
      error: "An account already uses this email. Log in instead, or use Forgot password.",
      values,
    };
  }

  // "Confirm email" is off: they're logged in already
  if (data.session) {
    redirect(next ?? "/");
  }

  // "Confirm email" is on: they must click the link in the email first
  return {
    success: `Almost done! We've sent a link to ${email}. Click it to confirm your email and log in. Check your spam folder if you can't see it.`,
    values,
  };
}

// ---------------------------------------------------------------------------
// FORGOT PASSWORD
// ---------------------------------------------------------------------------

// Sends a "reset your password" email.
// Takes: the previous form state, and the form (email).
// Gives back: ALWAYS the same message, whether or not the email has an
// account (and even if Supabase had a problem), so this page can never be
// used to find out who has signed up.
export async function requestPasswordReset(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readText(formData, "email").toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { fieldErrors: { email: "Please enter a valid email address." }, values: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Where the email link sends them: /auth/confirm logs them in for a
    // moment, then opens the "choose a new password" page
    redirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });

  if (error) {
    // Log only the error code for us (never the email address), and still
    // show the same message to the visitor
    console.error("Password reset email was not sent:", error.code ?? error.status);
  }

  return { success: RESET_EMAIL_SENT_MESSAGE };
}

// ---------------------------------------------------------------------------
// CHOOSE A NEW PASSWORD
// ---------------------------------------------------------------------------

// Saves a new password for the person who opened a reset link.
// Takes: the previous form state, and the form (password, confirm_password).
// Gives back: field errors, a general error, or a success message.
// The reset link (via /auth/confirm) has already logged them in, which is
// what allows Supabase to change the password.
export async function updatePassword(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = readPassword(formData, "password");
  const confirmPassword = readPassword(formData, "confirm_password");

  const fieldErrors: Record<string, string> = {};
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Please use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirmPassword !== password) {
    fieldErrors.confirm_password = "The two passwords don't match.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();

  // Security: only a logged-in person (from the reset link) may do this
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Your reset link has expired. Please ask for a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: friendlyAuthError(error) };
  }

  return { success: "Your password has been changed. You're logged in." };
}

// ---------------------------------------------------------------------------
// LOG OUT
// ---------------------------------------------------------------------------

// Logs the person out on this device and goes to the Home page.
// Takes: nothing (it's used as a form's action, so it works even before the
// page's JavaScript has loaded).
// Gives back: nothing; it always redirects.
export async function logOut(): Promise<void> {
  const supabase = await createClient();
  // "local" = only this browser. Their other devices stay logged in.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

// ---------------------------------------------------------------------------
// Small helpers (not exported, so the browser can't call them)
// ---------------------------------------------------------------------------

// The shared steps of both login pages.
// Takes: which login page was used ("client" or "admin") and the form.
// Gives back: an error to show, or sends them to their start page.
// Steps:
//   1. Supabase checks the email and password.
//   2. Deactivated accounts are logged straight back out.
//   3. The database's is_admin() says if it's an active admin. An account on
//      the wrong login page is logged straight back out, with a link to the
//      right page (Revisions part 1, item 1). We only say this AFTER the
//      password was right, so it never helps a stranger guess accounts.
//   4. They go to "next" or their usual start page (landingPath()).
async function logInThrough(portal: LoginPortal, formData: FormData): Promise<AuthFormState> {
  const email = readText(formData, "email").toLowerCase();
  const password = readPassword(formData, "password");
  const next = safeNextPath(formData.get("next"));
  const values = { email };

  if (!email || !password) {
    return { error: "Please enter your email and password.", values };
  }

  const supabase = await createClient();
  // --- 1. Checks the password. If it's right, Supabase saves the login in cookies.
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: friendlyAuthError(error), values };
  }

  // --- 2. Deactivated accounts may not log in: log them straight back out.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Something went wrong on our side. Please try again in a moment.", values };
  }
  if (!profile?.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: DEACTIVATED_MESSAGE, values };
  }

  // --- 3. Right login page for this account? (is_admin() = an ACTIVE admin)
  const { data: isAdminAnswer, error: roleError } = await supabase.rpc("is_admin");
  if (roleError) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Something went wrong on our side. Please try again in a moment.", values };
  }
  const isAdmin = isAdminAnswer === true;
  if (isWrongPortal(portal, isAdmin)) {
    // "local" = only this browser's brand-new login is ended
    await supabase.auth.signOut({ scope: "local" });
    return {
      error: wrongPortalMessage(portal),
      values,
      otherLogin:
        portal === "client"
          ? { href: ADMIN_LOGIN_PATH, label: "Go to the admin login" }
          : { href: CLIENT_LOGIN_PATH, label: "Go to the client login" },
    };
  }

  // --- 4. Where to go now. redirect() works by stopping this function, so
  //        it must be the last step (and never inside a try/catch).
  redirect(landingPath(isAdmin, next));
}

// Reads a text field from a form and trims spaces from both ends.
// Takes: the form data and the field name.
// Gives back: the text, or "" if it's missing.
function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Reads a password field exactly as typed (spaces count in passwords).
// Takes: the form data and the field name.
// Gives back: the password, or "" if it's missing.
function readPassword(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

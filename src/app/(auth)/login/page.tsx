// The Log in page: /login
// Where it's used: the "Log in" button in the header, and anywhere a guest
// opens a private page (src/proxy.ts sends them here with ?next=<page>).
//
// The address can carry:
//   ?next=/account          where to go after logging in (only paths on our site)
//   ?error=deactivated      the account was deactivated and has been logged out
//   ?error=deactivated-self (not an error) the client deactivated their own
//                           account; logging in again offers to reactivate it
//   ?error=link-expired     an email link was old or already used
//   ?error=other-browser    an email link was opened in a different browser
//   ?error=google-failed    Google sign-in was cancelled or didn't work
//   ?error=login-failed     a Google login was refused (an admin's account);
//                           it shows the same "Incorrect email or password."
//                           as a wrong password, with no hint about staff
//   ?error=account-deleted  (not an error) the person just deleted their account
// Clients who log in (with no "next") go to the Home page. ADMIN accounts
// can't log in here: they get "Incorrect email or password." like a wrong
// password (src/lib/auth/actions.ts), with no mention of staff.

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthPage } from "@/components/auth/AuthPage";
import { DEACTIVATED_MESSAGE } from "@/lib/auth/errors";
import { INCORRECT_LOGIN_MESSAGE } from "@/lib/auth/login-portal";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Log in" };

// The messages that ?error=... can ask for.
const NOTICES = {
  deactivated: { tone: "error", text: DEACTIVATED_MESSAGE },
  // After Deactivate on My Profile (Version 1.4)
  "deactivated-self": {
    tone: "info",
    text: "Your account is deactivated and you've been logged out. To use it again, just log in.",
  },
  "link-expired": {
    tone: "error",
    text: "That email link has expired or was already used. Log in below, or ask for a new link.",
  },
  // A "confirm your email" link opened in a different browser. Supabase has
  // already confirmed the email by then; only the automatic log in failed.
  "other-browser": {
    tone: "info",
    text: "Your email link was opened in a different browser, so we couldn't log you in automatically. If you were confirming your email, it's done. Just log in below.",
  },
  // Google sign-in (Change 17): cancelled on Google's page, or not set up
  "google-failed": {
    tone: "error",
    text: "Google sign-in didn't finish, so you're not logged in. Please try again, or log in with your email and password.",
  },
  // After Delete account on My Profile (Change 17)
  "account-deleted": {
    tone: "info",
    text: "Your account has been deleted and you've been logged out. Thank you for joining our classes.",
  },
  // A Google login that was refused (an admin's account): the same message
  // as a wrong password, so it gives nothing away
  "login-failed": { tone: "error", text: INCORRECT_LOGIN_MESSAGE },
} as const;

// The login page.
// Takes: searchParams (the ?next=... and ?error=... part of the address).
// Gives back: the page. The title shows at once; the form waits for the
// address to arrive (inside <Suspense>), which takes a split second.
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthPage overline="Welcome back" title="Log in" intro="See your bookings, vouchers and payments.">
      <Suspense fallback={<AuthFormSkeleton fields={2} />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}

// Reads the address, then shows the form.
// Takes: the searchParams promise from the page.
// Gives back: the LoginForm with a safe "next" and any notice.
async function LoginFormWithParams({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const error = firstParam(params.error);
  // Object.hasOwn: only OUR messages count (not built-in names like "toString")
  const notice = error && Object.hasOwn(NOTICES, error) ? NOTICES[error as keyof typeof NOTICES] : null;

  return <LoginForm portal="client" next={next} notice={notice} />;
}

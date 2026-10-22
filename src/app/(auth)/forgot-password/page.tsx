// The Forgot password page: /forgot-password
// Where it's used: "Forgot password?" on the login page. /auth/confirm also
// sends people here with ?error=link-expired when a reset link is too old,
// or ?error=other-browser when it was opened in a different browser.

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthPage } from "@/components/auth/AuthPage";
import { firstParam } from "@/lib/auth/safe-next";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = { title: "Forgot password" };

// The forgot-password page.
// Takes: searchParams (the ?error=... part of the address).
// Gives back: the page, with the form inside <Suspense> (it reads the address).
export default function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return (
    <AuthPage
      overline="Forgot password"
      title="Reset your password"
      intro="Enter the email you signed up with. We'll send you a link to choose a new password."
    >
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <ForgotPasswordFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}

// The messages that ?error=... can ask for (set by /auth/confirm).
const NOTICES: Record<string, string> = {
  "link-expired": "That reset link has expired or was already used. Please ask for a new one below.",
  // Our reset emails use Supabase's default link until Phase E, and that link
  // only works in the browser that asked for it
  "other-browser":
    "Please open the reset link in the same browser you used to ask for it. Or ask for a new link below, from this browser.",
};

// Reads the address, then shows the form.
// Takes: the searchParams promise from the page.
// Gives back: the form, with a note if the address asks for one.
async function ForgotPasswordFormWithParams({
  searchParams,
}: Pick<PageProps<"/forgot-password">, "searchParams">) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const notice = error && Object.hasOwn(NOTICES, error) ? NOTICES[error] : null;
  return <ForgotPasswordForm notice={notice} />;
}

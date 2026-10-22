// The Choose a new password page: /reset-password
// Where it's used: /auth/confirm sends people here after they open the link
// in their "reset your password" email. That link logs them in for a short
// time, which is what lets them set a new password.
//
// If someone opens this page without a valid link (not logged in), it shows
// a message and a link to ask for a new email instead of the form.

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthPage } from "@/components/auth/AuthPage";
import { FormMessage } from "@/components/ui/FormMessage";
import { getCurrentUser } from "@/lib/auth/user";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a new password" };

// The reset-password page.
// Takes: nothing.
// Gives back: the page; the login check happens inside <Suspense> (it reads cookies).
export default function ResetPasswordPage() {
  return (
    <AuthPage overline="Forgot password" title="Choose a new password">
      <Suspense fallback={<AuthFormSkeleton fields={2} />}>
        <ResetPasswordGate />
      </Suspense>
    </AuthPage>
  );
}

// Shows the form only to someone logged in by a reset link.
// Takes: nothing (reads the login cookies).
// Gives back: the form, or a "link expired" message with a way to get a new one.
async function ResetPasswordGate() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="error">
          This page only works from the link in your reset email, and that link has expired or
          was already used.
        </FormMessage>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brown hover:underline"
        >
          Send me a new link
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted">
        Choose a new password for <span className="font-semibold text-ink">{user.email}</span>.
      </p>
      <ResetPasswordForm />
    </>
  );
}

// The Sign up page: /signup
// Where it's used: "Create an account" on the login page. It keeps ?next=...
// so someone who was booking a class comes back to it after signing up.

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton, AuthPage } from "@/components/auth/AuthPage";
import { firstParam, safeNextPath } from "@/lib/auth/safe-next";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Sign up" };

// The sign-up page.
// Takes: searchParams (the ?next=... part of the address).
// Gives back: the page, with the form inside <Suspense> (it reads the address).
export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthPage
      overline="New here?"
      title="Create an account"
      intro="Book classes, and keep track of your bookings, payments and vouchers."
    >
      <Suspense fallback={<AuthFormSkeleton fields={4} />}>
        <SignupFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthPage>
  );
}

// Reads the address, then shows the form.
// Takes: the searchParams promise from the page.
// Gives back: the SignupForm with a safe "next" (or null).
async function SignupFormWithParams({ searchParams }: Pick<PageProps<"/signup">, "searchParams">) {
  const params = await searchParams;
  return <SignupForm next={safeNextPath(firstParam(params.next))} />;
}

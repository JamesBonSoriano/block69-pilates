"use client";
// The sign-up form: full name, phone number, birthday, email and password.
// Where it's used: src/app/(auth)/signup/page.tsx.
//
// The real work happens on the server in signUp() (src/lib/auth/actions.ts),
// which also checks every field again. The database's sign-up trigger then
// copies the name, phone number and birthday into the new profile.

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { signUp } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/errors";
import { emptyFormState } from "@/lib/auth/form-state";

// The sign-up form.
// Takes: next (a safe path to go to after signing up, or null).
// Gives back: the form, or a "check your email" message once it's done.
export function SignupForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(signUp, emptyFormState);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  // Done, and Supabase wants them to confirm their email first
  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="success">{state.success}</FormMessage>
        <Link href={loginHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-brown hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {next && <input type="hidden" name="next" value={next} />}

      <Input
        label="Full name"
        name="full_name"
        autoComplete="name"
        placeholder="Juan dela Cruz"
        maxLength={120}
        required
        defaultValue={values.full_name}
        error={errors.full_name}
      />
      <Input
        label="Phone number"
        name="mobile"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0917 123 4567"
        required
        defaultValue={values.mobile}
        error={errors.mobile}
      />
      {/* Required (Revisions part 1). The sign-up trigger saves it on the
          profile, and the client can't change it later (migration 12). */}
      <Input
        label="Birthday"
        name="birthday"
        type="date"
        min="1900-01-01"
        autoComplete="bday"
        required
        defaultValue={values.birthday}
        error={errors.birthday}
        hint="You can't change this later without messaging the cafe."
      />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@email.com"
        required
        defaultValue={values.email}
        error={errors.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        required
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={errors.password}
      />

      <Button type="submit" fullWidth disabled={pending} className="mt-2">
        {pending ? "Creating your account…" : "Create account"}
      </Button>

      <p className="mt-2 text-center text-sm">
        Already have an account?{" "}
        <Link href={loginHref} className="font-semibold text-brown underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

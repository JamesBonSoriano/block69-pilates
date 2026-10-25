"use client";
// The sign-up form: full name, phone number, birthday, email and password,
// plus "Sign up with Google" under it.
// Where it's used: src/app/(auth)/signup/page.tsx.
//
// The rules (Change 17) are checkSignupFields() in src/lib/validation.ts:
//   phone    exactly 11 digits starting with 09 (the box takes digits only, 11 at most)
//   birthday MM/DD/YYYY, a real calendar date with a 4-digit year, in the past
//   email    @gmail.com or @yahoo.com only (this version)
//   password at least 8 characters (with a show / hide button)
// They run HERE when the person presses "Create account" (so every problem
// shows at once, without waiting), and AGAIN in signUp() on the server
// (src/lib/auth/actions.ts), which is the check that counts. The database's
// sign-up trigger then copies the name, phone number and birthday into the
// new profile.
// Version 1.4: no hints under phone, birthday or email; the error messages
// explain the rules.

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { GoogleButton, OrDivider } from "@/components/auth/GoogleButton";
import { BirthdayInput } from "@/components/ui/BirthdayInput";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { signInWithGoogle, signUp } from "@/lib/auth/actions";
import { emptyFormState } from "@/lib/auth/form-state";
import { MIN_PASSWORD, checkSignupFields } from "@/lib/validation";

// The sign-up form.
// Takes: next (a safe path to go to after signing up, or null).
// Gives back: the form and the Google button, or a "check your email"
// message once it's done.
export function SignupForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(signUp, emptyFormState);
  // Problems found in the browser (null = none found on the last try)
  const [localErrors, setLocalErrors] = useState<Partial<Record<string, string>> | null>(null);
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

  // Checks the fields in the browser before sending.
  // Takes: the submit event. Gives back: nothing; if something is wrong it
  // stops the form from being sent and shows the messages.
  function checkBeforeSending(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "");
    const problems = checkSignupFields({
      full_name: text("full_name"),
      mobile: text("mobile"),
      birthday: text("birthday"),
      email: text("email"),
      password: text("password"),
    });
    if (Object.keys(problems).length > 0) {
      event.preventDefault(); // don't send; show the messages instead
      setLocalErrors(problems);
    } else {
      setLocalErrors(null); // all good: the server checks again
    }
  }

  // The browser's messages win until the form is sent again
  const errors = localErrors ?? state.fieldErrors ?? {};
  const values = state.values ?? {};

  return (
    <div className="flex flex-col gap-4">
      {/* noValidate: our own checks (above) show clearer messages than the
          browser's pop-ups. The server checks everything again anyway. */}
      <form action={formAction} onSubmit={checkBeforeSending} noValidate className="flex flex-col gap-4">
        {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
        {localErrors && (
          <FormMessage tone="error">Please fix the highlighted fields below.</FormMessage>
        )}
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
        {/* At most 11 digits, number keypad (Version 1.4: no hint; the
            error message explains the 09 rule) */}
        <PhoneInput
          label="Phone number"
          name="mobile"
          autoComplete="tel"
          required
          defaultValue={values.mobile}
          error={errors.mobile}
        />
        {/* Typed MM/DD/YYYY (the date picker allowed impossible years).
            key: after a server error, start from what they typed */}
        <BirthdayInput
          key={values.birthday ?? ""}
          name="birthday"
          required
          defaultValue={values.birthday}
          error={errors.birthday}
        />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@gmail.com"
          required
          defaultValue={values.email}
          error={errors.email}
        />
        <PasswordInput
          label="Password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          required
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={errors.password}
        />

        <Button type="submit" fullWidth disabled={pending} className="mt-2">
          {pending ? "Creating your account…" : "Create account"}
        </Button>
      </form>

      <OrDivider />
      {/* A separate small form: Google needs none of the fields above */}
      <form action={signInWithGoogle}>
        {next && <input type="hidden" name="next" value={next} />}
        <GoogleButton label="Sign up with Google" />
      </form>

      <p className="mt-2 text-center text-sm">
        Already have an account?{" "}
        <Link href={loginHref} className="font-semibold text-brown underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

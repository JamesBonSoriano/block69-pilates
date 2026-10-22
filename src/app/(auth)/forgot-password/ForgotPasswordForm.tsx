"use client";
// The "forgot password" form: one email box.
// Where it's used: src/app/(auth)/forgot-password/page.tsx.
//
// The server (requestPasswordReset in src/lib/auth/actions.ts) always gives
// back the same message, so this page never shows whether an email has an account.

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { requestPasswordReset } from "@/lib/auth/actions";
import { emptyFormState } from "@/lib/auth/form-state";

// The forgot-password form.
// Takes: an optional notice (e.g. "your link expired") from the page address.
// Gives back: the form, or the "check your email" message once it's sent.
export function ForgotPasswordForm({ notice }: { notice: string | null }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, emptyFormState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage tone="success">{state.success}</FormMessage>
        <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-brown hover:underline">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {notice && <FormMessage tone="error">{notice}</FormMessage>}
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@email.com"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Button type="submit" fullWidth disabled={pending} className="mt-2">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="mt-2 text-center text-sm">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brown underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

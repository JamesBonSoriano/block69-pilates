"use client";
// The log in form (email + password), following docs/designs/PhoneLogin.html.
// Where it's used: the client login page (src/app/(auth)/login/page.tsx) and
// the admin login page (src/app/admin/login/page.tsx).
//
// "use client" = it runs in the browser too, so it can show "Logging in…"
// and the error message without reloading the page. The real work happens on
// the server in logIn() / adminLogIn() (src/lib/auth/actions.ts), which also
// refuse an account on the wrong login page.

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { adminLogIn, logIn } from "@/lib/auth/actions";
import { emptyFormState } from "@/lib/auth/form-state";
import type { LoginPortal } from "@/lib/auth/login-portal";

type LoginFormProps = {
  portal: LoginPortal; // "client" (/login) or "admin" (/admin/login)
  next: string | null; // a safe path to go back to after logging in
  notice: { tone: "error" | "info"; text: string } | null; // e.g. "deactivated"
};

// The login form.
// Takes: portal, next and an optional notice (worked out by the page).
// Gives back: the form. On success the server sends the person on; on a
// problem it shows the error (with a link to the other login page if they
// used the wrong one) and keeps the email they typed.
export function LoginForm({ portal, next, notice }: LoginFormProps) {
  // state = what the action last answered; formAction = send the form to it;
  // pending = true while the server is working
  const [state, formAction, pending] = useActionState(portal === "admin" ? adminLogIn : logIn, emptyFormState);

  // Keep "next" on the sign-up link too, so new users also come back here
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* A message from the page address (shown until they try to log in) */}
      {notice && !state.error && <FormMessage tone={notice.tone}>{notice.text}</FormMessage>}
      {state.error && (
        <FormMessage tone="error">
          {state.error}
          {/* Wrong login page for this account: link to the right one */}
          {state.otherLogin && (
            <>
              {" "}
              <Link href={state.otherLogin.href} className="font-semibold underline underline-offset-4">
                {state.otherLogin.label}
              </Link>
            </>
          )}
        </FormMessage>
      )}

      {/* Hidden: tells the server where to go next (it re-checks it's safe) */}
      {next && <input type="hidden" name="next" value={next} />}

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@email.com"
        required
        defaultValue={state.values?.email}
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      <Link
        href="/forgot-password"
        className="-mt-2 inline-flex min-h-11 items-center self-end text-[13px] font-semibold text-brown hover:underline"
      >
        Forgot password?
      </Link>

      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>

      {/* Clients can make an account; staff accounts are made by an admin */}
      {portal === "client" ? (
        <p className="mt-2 text-center text-sm">
          New here?{" "}
          <Link href={signupHref} className="font-semibold text-brown underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      ) : (
        <p className="mt-2 text-center text-sm">
          Not cafe staff?{" "}
          <Link href="/login" className="font-semibold text-brown underline-offset-4 hover:underline">
            Go to the client login
          </Link>
        </p>
      )}
    </form>
  );
}

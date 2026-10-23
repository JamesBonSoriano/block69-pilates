"use client";
// The account forms on My Profile (Change 17, Part G):
//   EmailChange      "Change email": new email -> two 6-digit codes -> done
//   ChangePassword   current + new password (or "Set a password" for
//                    Google-only accounts, through Forgot password)
//   DeactivateAccount  warning + "I understand" tick + confirm
//   DeleteAccount      what still blocks it, or warning + type DELETE (+ password)
// Where it's used: src/app/(client)/account/profile/page.tsx.
//
// "use client" = each one opens and closes in place and shows "Saving…" and
// errors without a page reload. The work happens in Server Actions
// (src/lib/account/actions.ts), which check everything again; the database
// has the final say (migration 16).

import { CircleAlert, KeyRound, Mail, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import {
  changePassword,
  confirmEmailChange,
  deactivateAccount,
  deleteAccount,
  startEmailChange,
} from "@/lib/account/actions";
import { emptyAccountFormState, type EmailChangeState } from "@/lib/account/form-state";
import type { DeletionBlocker } from "@/lib/data/account";
import { formatClassDate } from "@/lib/format";
import { MIN_PASSWORD } from "@/lib/validation";

// ---------------------------------------------------------------------------
// Shared: a row with a title, a line of text and a button that opens a panel
// ---------------------------------------------------------------------------

// One account setting: shown as a row, the button opens its form under it.
// Takes: the icon, title, a short line, the button label, the button look,
// and a function that draws the open panel (given a "close" function).
// Gives back: the row, and the panel while it's open.
function SettingRow({
  icon: Icon,
  title,
  text,
  buttonLabel,
  danger = false,
  children,
}: {
  icon: typeof Mail;
  title: string;
  text: ReactNode;
  buttonLabel: string;
  danger?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            danger
              ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-error-bg text-error"
              : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-tan-soft text-brown"
          }
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <div className="break-words text-sm text-muted">{text}</div>
        </div>
        {!open && (
          <Button variant={danger ? "danger" : "secondary"} onClick={() => setOpen(true)} className="max-sm:w-full">
            {buttonLabel}
          </Button>
        )}
      </div>
      {open && children(() => setOpen(false))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change email (two codes)
// ---------------------------------------------------------------------------

// The "Change email" row.
// Takes: the current login email, and an email change already waiting for
// its codes (pendingEmail, or null).
// Gives back: the row; open, it walks through: new email -> codes -> done.
export function EmailChange({ currentEmail, pendingEmail }: { currentEmail: string; pendingEmail: string | null }) {
  return (
    <SettingRow
      icon={Mail}
      title="Email"
      text={
        <>
          <span className="font-semibold text-ink">{currentEmail}</span>
          {pendingEmail && <span className="block">Waiting for the codes to change it to {pendingEmail}.</span>}
        </>
      }
      buttonLabel="Change email"
    >
      {(close) => <EmailChangeSteps currentEmail={currentEmail} pendingEmail={pendingEmail} onClose={close} />}
    </SettingRow>
  );
}

// The steps inside the open "Change email" panel.
// Takes: the current email, a waiting change (or null), and what Cancel does.
// Gives back: step 1 (new email), step 2 (the two codes) or done.
function EmailChangeSteps({
  currentEmail,
  pendingEmail,
  onClose,
}: {
  currentEmail: string;
  pendingEmail: string | null;
  onClose: () => void;
}) {
  // A change already waiting starts on the codes step
  const firstState: EmailChangeState = pendingEmail ? { step: "codes", newEmail: pendingEmail } : { step: "start" };
  const [sent, sendCodes, sending] = useActionState(startEmailChange, firstState);
  const [checked, checkCodes, checking] = useActionState(confirmEmailChange, { step: "codes" } as EmailChangeState);
  // "Use a different email" goes back to step 1
  const [restart, setRestart] = useState(false);

  // Done: the login email has changed
  if (checked.step === "done") {
    return (
      <div className="flex flex-col items-start gap-3">
        <FormMessage tone="success">Your email is now {checked.newEmail}. Use it the next time you log in.</FormMessage>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  // Step 2: the two codes
  if (sent.step === "codes" && !restart) {
    const newEmail = sent.newEmail ?? "";
    return (
      <form action={checkCodes} className="flex flex-col gap-4 rounded-2xl bg-white p-4">
        <input type="hidden" name="new_email" value={newEmail} />
        <p className="text-sm leading-relaxed">
          We sent a 6-digit code to <strong className="break-all">{currentEmail}</strong> and another to{" "}
          <strong className="break-all">{newEmail}</strong>. Enter both to confirm. (Check your spam folder too.)
        </p>
        {checked.error && <FormMessage tone="error">{checked.error}</FormMessage>}
        {checked.info && <FormMessage tone="info">{checked.info}</FormMessage>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={`Code sent to ${currentEmail}`}
            name="code_current"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            error={checked.fieldErrors?.code_current}
          />
          <Input
            label={`Code sent to ${newEmail}`}
            name="code_new"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            required
            error={checked.fieldErrors?.code_new}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="submit" disabled={checking}>
            {checking ? "Checking…" : "Confirm new email"}
          </Button>
          <Button variant="secondary" onClick={() => setRestart(true)} disabled={checking}>
            Use a different email
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={checking}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  // Step 1: the new email
  return (
    <form
      action={(formData) => {
        setRestart(false);
        sendCodes(formData);
      }}
      className="flex flex-col gap-4 rounded-2xl bg-white p-4"
    >
      {sent.error && <FormMessage tone="error">{sent.error}</FormMessage>}
      <Input
        label="New email"
        name="new_email"
        type="email"
        autoComplete="email"
        placeholder="you@gmail.com"
        required
        defaultValue={sent.newEmail}
        error={sent.fieldErrors?.new_email}
        hint="Gmail or Yahoo only. We'll send a code to your current email and to the new one."
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={sending}>
          {sending ? "Sending codes…" : "Send codes"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

// The "Password" row.
// Takes: hasPassword (false = a Google-only account).
// Gives back: Change password (current + new + again), or for Google-only
// accounts a note with "Set a password" (Forgot password sends a link).
export function ChangePassword({ hasPassword }: { hasPassword: boolean }) {
  if (!hasPassword) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-line py-4 last:border-b-0">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tan-soft text-brown">
          <KeyRound aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Password</p>
          <p className="text-sm text-muted">You log in with Google, so you don&apos;t have a password here yet.</p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brown underline-offset-4 hover:underline"
        >
          Set a password
        </Link>
      </div>
    );
  }
  return (
    <SettingRow
      icon={KeyRound}
      title="Password"
      text={
        <>
          At least {MIN_PASSWORD} characters.{" "}
          <Link href="/forgot-password" className="font-semibold text-brown underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
        </>
      }
      buttonLabel="Change password"
    >
      {(close) => <ChangePasswordForm onClose={close} />}
    </SettingRow>
  );
}

// The open "Change password" form.
// Takes: what Cancel / Close does. Gives back: the three password boxes.
function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(changePassword, emptyAccountFormState);
  if (state.success) {
    return (
      <div className="flex flex-col items-start gap-3">
        <FormMessage tone="success">{state.success}</FormMessage>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl bg-white p-4">
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <PasswordInput label="Current password" name="current_password" autoComplete="current-password" required error={errors.current_password} />
      <PasswordInput
        label="New password"
        name="new_password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD}
        required
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={errors.new_password}
      />
      <PasswordInput
        label="New password again"
        name="confirm_password"
        autoComplete="new-password"
        required
        error={errors.confirm_password}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save new password"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Deactivate
// ---------------------------------------------------------------------------

// The "Deactivate account" row.
// Takes: upcoming = how many upcoming classes they have (for the warning).
// Gives back: the row; open, a warning, the "I understand" tick and the button.
export function DeactivateAccount({ upcoming }: { upcoming: number }) {
  return (
    <SettingRow
      icon={UserX}
      title="Deactivate account"
      text="Turn your account off. You can't log in or book until the cafe turns it back on."
      buttonLabel="Deactivate"
      danger
    >
      {(close) => <DeactivateForm upcoming={upcoming} onClose={close} />}
    </SettingRow>
  );
}

// The open "Deactivate" panel.
// Takes: the number of upcoming classes and what Cancel does.
// Gives back: the warning and the confirm form.
function DeactivateForm({ upcoming, onClose }: { upcoming: number; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(deactivateAccount, emptyAccountFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-error/30 bg-error-bg/40 p-4">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-ink">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-error" />
        <span>
          You&apos;ll be logged out on every device, and you won&apos;t be able to log in or book.
          {upcoming > 0 && (
            <>
              {" "}
              <strong>
                You still have {upcoming} upcoming class{upcoming === 1 ? "" : "es"}.
              </strong>{" "}
              Deactivating doesn&apos;t cancel {upcoming === 1 ? "it" : "them"} or give money back.
            </>
          )}{" "}
          To use your account again, message the cafe.
        </span>
      </p>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <Checkbox name="understand" label="I understand, deactivate my account." error={state.fieldErrors?.understand} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deactivating…" : "Deactivate my account"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

// The "Delete account" row.
// Takes: what still blocks it ([] = nothing; null = couldn't check), and
// hasPassword (then the password is asked again).
// Gives back: the row. If something blocks it, the row says what to do first
// and has no button. Otherwise the button opens the warning and the form.
export function DeleteAccount({ blockers, hasPassword }: { blockers: DeletionBlocker[] | null; hasPassword: boolean }) {
  const title = "Delete account";

  if (blockers === null) {
    return (
      <BlockedRow title={title}>
        <p>We couldn&apos;t check your account right now. Please refresh the page in a moment.</p>
      </BlockedRow>
    );
  }
  if (blockers.length > 0) {
    return (
      <BlockedRow title={title}>
        <p className="font-semibold text-ink">You can&apos;t delete your account yet:</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
          {blockers.map((blocker) => (
            <li key={blocker.kind}>{blockerText(blocker)}</li>
          ))}
        </ul>
      </BlockedRow>
    );
  }
  return (
    <SettingRow
      icon={Trash2}
      title={title}
      text="Remove your account and your personal details for good."
      buttonLabel="Delete"
      danger
    >
      {(close) => <DeleteForm hasPassword={hasPassword} onClose={close} />}
    </SettingRow>
  );
}

// A Delete row that can't be used yet: the reason(s), no button.
// Takes: the title and the explanation. Gives back: the row.
function BlockedRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-4 last:border-b-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-error-bg text-error">
        <Trash2 aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1 text-sm text-muted">
        <p className="text-base font-semibold text-ink sm:text-sm">{title}</p>
        {children}
      </div>
    </div>
  );
}

// What to do first for one blocker, in plain words.
// Takes: the blocker. Gives back: one sentence.
function blockerText(blocker: DeletionBlocker): ReactNode {
  const when = blocker.firstDate ? ` (the first one is on ${formatClassDate(blocker.firstDate).short})` : "";
  switch (blocker.kind) {
    case "upcoming_class":
      return (
        <>
          You have {blocker.howMany} upcoming class{blocker.howMany === 1 ? "" : "es"}
          {when}.{" "}
          <Link href="/account/bookings" className="font-semibold text-brown underline underline-offset-4">
            Cancel {blocker.howMany === 1 ? "it" : "them"} in My Bookings
          </Link>
          , or wait until after {blocker.howMany === 1 ? "it" : "them"}.
        </>
      );
    case "seat_on_hold":
      return "You have a seat on hold. Finish paying for it, or let the hold run out.";
    default:
      return "The cafe is still checking one of your payments. Please wait until it's approved or rejected.";
  }
}

// The open "Delete" panel.
// Takes: hasPassword and what Cancel does.
// Gives back: what happens to their data, "type DELETE", the password (if
// any) and the button.
function DeleteForm({ hasPassword, onClose }: { hasPassword: boolean; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(deleteAccount, emptyAccountFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-2xl border border-error/30 bg-error-bg/40 p-4">
      <div className="flex items-start gap-2 text-sm leading-relaxed text-ink">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-error" />
        <div className="flex flex-col gap-1">
          <p>
            <strong>This can&apos;t be undone.</strong> Your login, name, email, mobile number, Instagram and birthday
            are removed, any unused vouchers stop working, and you&apos;ll be logged out.
          </p>
          <p>
            The cafe keeps the records of your past classes and payments (without your personal details), as it
            must for its accounts.
          </p>
        </div>
      </div>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <Input
        label='Type DELETE to confirm'
        name="confirm_text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
        error={errors.confirm_text}
      />
      {hasPassword && (
        <PasswordInput label="Your password" name="password" autoComplete="current-password" required error={errors.password} />
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

"use client";
// The "Cancel booking" button on the admin booking details page, and the
// box it opens.
// Where it's used: src/app/admin/bookings/[bookingId]/page.tsx (only for
// confirmed bookings and late payments).
//
// The box first says what the cancellation rules give for this booking right
// now (the database's admin_change_rule, migration 10), then lets the admin
// pick:
//   - Cancel with a personal 50% code (not for walk-ins: no account)
//   - Cancel with no credit
// Version 1.4: the admin can no longer move a client to a chosen class.
// Clients transfer themselves from My Bookings (also when the cafe cancelled
// the class). So when the rules say "transfer", both cancel choices are
// overrides.
// The choice the rules give is marked "Normal rule". Any other choice is an
// OVERRIDE and needs a reason. The reason is saved with the booking where
// only admins can read it (booking_admin_actions).
// Sending runs changeOneBooking() (src/lib/admin/actions.ts), and the
// database checks everything again (rule, reason, with a lock).
//
// "use client" = it opens a box (<dialog>), and the reason box becomes
// required as soon as an override is picked.

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useId, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { Textarea } from "@/components/ui/Textarea";
import { changeOneBooking } from "@/lib/admin/actions";
import { emptyBookingChangeState } from "@/lib/admin/form-state";
import type { AdminActionKind, AdminChangeRule } from "@/types/app";

// The two choices, as the form sends them, and the action each one is.
const CHOICES: { value: "voucher" | "no_credit"; action: AdminActionKind; label: string }[] = [
  { value: "voucher", action: "cancel_voucher", label: "Cancel with a personal 50% code" },
  { value: "no_credit", action: "cancel_no_credit", label: "Cancel with no credit" },
];

// What each rule means, in plain words, for the top of the box.
// (Transfers are done by the client in My Bookings, not here.)
const RULE_TEXT: Record<AdminChangeRule, string> = {
  transfer:
    "The class is more than 24 hours away. The normal rule is one free transfer, which the client does in My Bookings. Cancelling now is an override.",
  already_transferred:
    "This booking was already moved once and the class is more than 24 hours away. The rules allow no change right now, so anything you do is an override.",
  voucher: "The class is 12 to 24 hours away. The normal rule is: cancel with a personal 50% code (class fee, 60 days, one use).",
  no_credit: "The class is less than 12 hours away. The normal rule is: cancel with no credit.",
  free_transfer:
    "The cafe cancelled this class. The client keeps their payment and can move to any open class for free in My Bookings. Cancel only if the client asks; it is an override.",
  started:
    "This class has already started. The rules allow no change, so anything you do is an override. (To mark attendance, use Attended / No-show.)",
  late_payment:
    "They paid after their seat hold ended while the class was full. They can move to any open class for free in My Bookings (no 24-hour rule). Cancel only if they ask (a 50% code, or no credit after a refund outside the website); it is an override.",
};

type BookingChangeBoxProps = {
  bookingId: string;
  guestName: string;
  classLabel: string; // the booking's class now, e.g. "Sat, Oct 25 · 9:00 – 9:50 AM"
  rule: AdminChangeRule;
  normalAction: AdminActionKind | null; // allowed without a reason (null = nothing)
  voucherAllowed: boolean; // false for walk-ins
};

// The button + box.
// Takes: the props above.
// Gives back: a secondary button and the box it opens.
export function BookingChangeBox({
  bookingId,
  guestName,
  classLabel,
  rule,
  normalAction,
  voucherAllowed,
}: BookingChangeBoxProps) {
  const [state, formAction, pending] = useActionState(changeOneBooking, emptyBookingChangeState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();
  // Start on the choice the rules give (if any)
  const [choice, setChoice] = useState(CHOICES.find((item) => item.action === normalAction)?.value ?? "");
  const picked = CHOICES.find((item) => item.value === choice);
  const isOverride = picked !== undefined && picked.action !== normalAction;

  // Closes the box. After a change, the page is drawn again (not earlier, so
  // the admin could read the result first).
  // Takes: nothing. Gives back: nothing.
  function handleClose() {
    if (state.done) router.refresh();
  }

  // Sends the form. (onSubmit, not action={...}: React would empty the form
  // after a refused change, and the admin would lose the reason they typed.)
  // Takes: the submit event. Gives back: nothing.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <>
      <Button variant="danger" aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}>
        Cancel booking
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={handleClose}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-admin-line bg-white p-6 text-ink backdrop:bg-ink/50"
      >
        {state.done ? (
          // ---- After the change ----
          <div className="flex flex-col gap-4">
            <CircleCheck aria-hidden="true" className="size-8 text-success" />
            <h2 id={titleId} className="text-xl font-semibold">
              Done
            </h2>
            <p className="text-sm leading-relaxed">{state.done.message}</p>
            {state.done.voucherCode && (
              <p className="rounded-xl bg-admin-bg px-4 py-3 text-sm">
                The code: <span className="font-heading text-base font-semibold text-brown">{state.done.voucherCode}</span>
              </p>
            )}
            {state.done.overridden && (
              <p className="text-xs text-muted">This was an override. Your reason is saved with the booking.</p>
            )}
            <FormMessage tone="info">
              Emails aren&apos;t sent yet (they come in a later step), so please message {guestName} yourself.
            </FormMessage>
            <Button fullWidth onClick={() => dialogRef.current?.close()}>
              Close
            </Button>
          </div>
        ) : (
          // ---- The choices ----
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="booking_id" value={bookingId} />
            <div>
              <h2 id={titleId} className="text-xl font-semibold">
                Cancel booking
              </h2>
              <p className="text-sm text-muted">
                {guestName} · {classLabel}
              </p>
            </div>
            <p className="rounded-xl bg-admin-bg px-4 py-3 text-sm leading-relaxed">{RULE_TEXT[rule]}</p>

            <RadioGroup legend="How should it be cancelled?" name="choice">
              {CHOICES.map((item) => {
                const blocked = item.value === "voucher" && !voucherAllowed;
                return (
                  <RadioOption
                    key={item.value}
                    name="choice"
                    value={item.value}
                    label={item.label}
                    description={blocked ? "Walk-ins have no account, so they can't get a code." : undefined}
                    aside={
                      blocked ? undefined : item.action === normalAction ? (
                        <Badge variant="success">Normal rule</Badge>
                      ) : (
                        <Badge variant="warning">Override</Badge>
                      )
                    }
                    checked={choice === item.value}
                    onChange={() => setChoice(item.value)}
                    disabled={blocked}
                    required
                  />
                );
              })}
            </RadioGroup>

            <Textarea
              label={isOverride ? "Reason (required for an override)" : "Note"}
              name="note"
              required={isOverride}
              maxLength={500}
              rows={3}
              placeholder={isOverride ? "e.g. Client was sick and sent a doctor's note" : "Optional"}
              hint="Saved with the booking. Only admins can see it."
            />

            {state.error && <FormMessage tone="error">{state.error}</FormMessage>}

            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button type="submit" variant="danger" disabled={pending || !picked} fullWidth className="sm:flex-1">
                {pending ? "Saving…" : "Cancel booking"}
              </Button>
              <Button variant="secondary" fullWidth className="sm:flex-1" onClick={() => dialogRef.current?.close()}>
                Go back
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

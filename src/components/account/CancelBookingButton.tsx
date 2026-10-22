"use client";
// The "Cancel" button on a confirmed booking (My Bookings), and the box it
// opens.
// Where it's used: src/components/account/BookingCard.tsx.
//
// Nothing is cancelled straight away. The box first says EXACTLY what the
// policy means for this booking right now (e.g. "Your class is in 18 hours.
// If you cancel now, you'll get a personal 50% voucher..."), using the same
// rule as the database (change_rule, migration 8). Only when the person
// confirms does cancelBooking() (src/lib/account/actions.ts) run.
// If the rule changed while the box was open (the class crossed the 12-hour
// mark), the action cancels nothing and the box shows the new explanation.
// Afterwards the box shows the result (and the voucher code, with Copy).
//
// "use client" = it opens a box (<dialog>) and shows "Cancelling…".

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useId, useRef } from "react";
import { cancelBooking } from "@/lib/account/actions";
import { emptyCancelBookingState } from "@/lib/account/form-state";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { cancelExplanation } from "@/lib/booking-rules";
import type { ChangeRule } from "@/types/app";
import { VoucherCode } from "./VoucherCode";

type CancelBookingButtonProps = {
  bookingId: string;
  classLabel: string; // e.g. "Thu, Oct 23 · 9:00 – 9:50 AM"
  rule: ChangeRule; // from get_my_bookings when the page was drawn
  timeLeft: string; // e.g. "in 18 hours"
  cancelOpensAt: string; // 24 hours before class, e.g. "Wed, Oct 22, 9:00 AM"
  transferHref: string | null; // the transfer page, if a transfer is allowed
};

// The Cancel button + box.
// Takes: the props above.
// Gives back: a red outline "Cancel" button, and the box it opens.
export function CancelBookingButton({
  bookingId,
  classLabel,
  rule,
  timeLeft,
  cancelOpensAt,
  transferHref,
}: CancelBookingButtonProps) {
  const [state, formAction, pending] = useActionState(cancelBooking, emptyCancelBookingState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();

  // The rule to explain: the newer one if the action found it changed
  const current = state.changed ?? { rule, timeLeft, cancelOpensAt };
  const explanation = cancelExplanation(current.rule, current.timeLeft, current.cancelOpensAt);

  // Closes the box. If the booking was cancelled, the list is drawn again
  // now (not earlier, so the person could read and copy the voucher code).
  // Takes: nothing. Gives back: nothing.
  function handleClose() {
    if (state.done) router.refresh();
  }

  return (
    <>
      <Button
        variant="danger"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className="flex-1 sm:flex-none"
      >
        Cancel
      </Button>

      {/* <dialog> + showModal(): a real pop-up box. The page behind can't be
          clicked, the Escape key closes it, and screen readers know it's a box. */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={handleClose}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-line bg-card p-6 text-ink backdrop:bg-ink/50"
      >
        {state.done ? (
          // ---- After cancelling: the result ----
          <div className="flex flex-col gap-4">
            <CircleCheck aria-hidden="true" className="size-8 text-success" />
            <h2 id={titleId} className="font-heading text-xl font-semibold text-brown">
              Booking cancelled
            </h2>
            <p className="text-sm text-muted">{classLabel}</p>
            {state.done.voucherCode ? (
              <>
                <p className="text-sm leading-relaxed">
                  Here&apos;s your personal 50% voucher for the class fee
                  {state.done.voucherExpires && <>, valid until {state.done.voucherExpires}</>}. You can
                  use it once, and it&apos;s saved in My Vouchers.
                </p>
                <VoucherCode code={state.done.voucherCode} />
              </>
            ) : (
              <p className="text-sm leading-relaxed">
                No voucher or refund was given, because the class was less than 12 hours away.
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              {state.done.voucherCode && (
                <ButtonLink href="/account/vouchers" variant="secondary" fullWidth className="sm:flex-1">
                  See my vouchers
                </ButtonLink>
              )}
              <Button fullWidth className="sm:flex-1" onClick={() => dialogRef.current?.close()}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          // ---- Before cancelling: what it means for this booking ----
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="booking_id" value={bookingId} />
            {/* The rule the person is agreeing to; the action checks it's still true */}
            <input type="hidden" name="expected_rule" value={current.rule} />

            <h2 id={titleId} className="font-heading text-xl font-semibold text-brown">
              {explanation.title}
            </h2>
            <p className="text-sm text-muted">{classLabel}</p>
            {state.changed && (
              <FormMessage tone="info">
                The time changed while this box was open, so please read the updated rule.
              </FormMessage>
            )}
            <p className="text-sm leading-relaxed">{explanation.body}</p>
            {state.error && <FormMessage tone="error">{state.error}</FormMessage>}

            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              {explanation.confirmLabel && (
                <Button type="submit" variant="danger" disabled={pending} fullWidth className="sm:flex-1">
                  {pending ? "Cancelling…" : explanation.confirmLabel}
                </Button>
              )}
              {explanation.offerTransfer && transferHref && (
                <ButtonLink href={transferHref} fullWidth className="sm:flex-1">
                  Transfer instead
                </ButtonLink>
              )}
              <Button
                variant="secondary"
                fullWidth
                className="sm:flex-1"
                onClick={() => dialogRef.current?.close()}
              >
                Keep my booking
              </Button>
            </div>
            <a
              href="/policies#cancellation"
              target="_blank"
              className="text-xs font-semibold text-brown underline underline-offset-2"
            >
              Read the full cancellation policy
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </form>
        )}
      </dialog>
    </>
  );
}

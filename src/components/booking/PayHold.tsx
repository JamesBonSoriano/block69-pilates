"use client";
// The live part of booking step 3 (the pay page): the seat-hold countdown,
// where the payment buttons go, and the sticky Pay bar.
// When the countdown reaches 0:00 it swaps itself for "Your seat was
// released" (HoldExpired.tsx). Layout follows docs/designs/PhoneBook3.html.
// Where it's used: src/app/(client)/book/pay/[bookingId]/page.tsx.
//
// THE COUNTDOWN: the database says how many seconds are left
// (get_my_booking's hold_seconds_left, worked out with the database's own
// clock). We count down from that number, using the device clock only to
// measure how much time has PASSED since the page opened. So a phone whose
// clock is set wrong still shows the right time left.
// It's only a display: the database itself stops counting the seat at the
// end of the hold, whatever this timer shows.
//
// PAYING (Step 12):
//   - The client picks GCash, Maya or a card (like PhoneBook3.html), then
//     the Pay button sends the booking id + method to payOnline()
//     (src/lib/booking/payment-actions.ts), which opens PayMongo's page for
//     the booking's total. No amount is ever sent from here.
//   - A 0-peso booking (100% promo + own mat) gets "Confirm my free booking".
//   - When the admin turned it on, "PayMongo not working?" opens the manual
//     GCash / BPI transfer form (ManualTransfer.tsx).

import { CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";
import { BookingAside, BookingColumns } from "@/components/booking/BookingLayout";
import { HoldExpired } from "@/components/booking/HoldExpired";
import { ManualTransfer } from "@/components/booking/ManualTransfer";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { formatCountdown } from "@/lib/booking-rules";
import { emptyPaymentState } from "@/lib/booking/form-state";
import { confirmFreeBooking, payOnline } from "@/lib/booking/payment-actions";
import { cn } from "@/lib/cn";

type PayHoldProps = {
  secondsLeft: number; // from the database, when the page was drawn
  holdMinutes: number; // for the "seat released" text
  sessionId: string; // for "Try this class again"
  bookingId: string; // so "Try this class again" keeps this hold's choices
  total: string; // already formatted, e.g. "₱500"
  isFree: boolean; // total is 0: nothing to pay, just confirm
  // The GCash / BPI transfer backup (null = the admin turned it off)
  manual: {
    userId: string;
    gcashName: string;
    gcashNumber: string;
    bpiAccountName: string;
    bpiAccountNumber: string;
  } | null;
  notice?: ReactNode; // a message from the server, e.g. "You left PayMongo's page"
  children: ReactNode; // the booking summary card (drawn on the server)
};

// The online methods, in the mockup's order: our name, the label and icon.
const METHODS = [
  { value: "gcash", label: "GCash", icon: Wallet },
  { value: "maya", label: "Maya", icon: Smartphone },
  { value: "card", label: "Credit or debit card", icon: CreditCard },
] as const;
type Method = (typeof METHODS)[number]["value"];

// The short name on the Pay button, e.g. "Pay ₱550 with GCash".
const BUTTON_NAMES: Record<Method, string> = { gcash: "GCash", maya: "Maya", card: "card" };

// When to tell screen readers how much time is left (seconds).
// (Reading out every second would be far too much.)
const ANNOUNCE_AT = [600, 300, 120, 60];

// The live pay section.
// Takes: the props above.
// Gives back: the countdown, the summary, the payment choices and the Pay
// bar; or "Your seat was released" once the time is up.
export function PayHold({
  secondsLeft,
  holdMinutes,
  sessionId,
  bookingId,
  total,
  isFree,
  manual,
  notice,
  children,
}: PayHoldProps) {
  // The picked online method (GCash first, like the mockup)
  const [method, setMethod] = useState<Method>("gcash");
  // The Pay button (or "Confirm my free booking"). pending = true while the
  // server works, which also stops double clicks.
  const [state, formAction, pending] = useActionState(isFree ? confirmFreeBooking : payOnline, emptyPaymentState);
  // Start from the database's number. The server and the browser both start
  // with it, so the first drawing matches (no "hydration" warning).
  const [left, setLeft] = useState(secondsLeft);

  useEffect(() => {
    // The moment (device clock) the hold ends, measured from NOW. Only the
    // difference matters, so a wrong device clock doesn't change anything.
    const endsAt = Date.now() + secondsLeft * 1000;
    // Ticks 4 times a second so the number changes right on time. Phones
    // slow timers down in background tabs; working it out from endsAt each
    // tick keeps it right when they come back.
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 250);
    // Stop the timer if the person leaves the page
    return () => clearInterval(timer);
  }, [secondsLeft]);

  // Time's up: the seat is released
  if (left <= 0) {
    return (
      <div role="status" className="flex flex-col">
        <HoldExpired sessionId={sessionId} bookingId={bookingId} holdMinutes={holdMinutes} />
      </div>
    );
  }

  // Under 2 minutes: the red color instead of yellow
  const urgent = left <= 120;
  // The latest "announce" point we've passed, e.g. 300 -> "5 minutes left"
  const announce = ANNOUNCE_AT.find((mark) => left <= mark && left > mark - 60);

  return (
    <div className="flex flex-col gap-5">
      {/* The countdown (the yellow box in the mockup) */}
      <div
        className={cn(
          "rounded-[14px] px-4 py-3 text-[13px] font-semibold leading-relaxed",
          urgent ? "bg-error-bg text-error" : "bg-warning-bg text-warning",
        )}
      >
        {/* role="timer": screen readers know it's a clock and don't read every change */}
        Your seat is held for{" "}
        <span role="timer" className="font-heading text-base tabular-nums">
          {formatCountdown(left)}
        </span>
        . Pay before the timer ends.
      </div>
      {/* Read out only at 10, 5, 2 and 1 minute(s) left */}
      <p aria-live="polite" className="sr-only">
        {announce ? `${Math.round(announce / 60)} minute${announce === 60 ? "" : "s"} left to pay.` : ""}
      </p>

      <BookingColumns>
        <div className="flex min-w-0 flex-col gap-6">
          {/* The booking summary (from the server) */}
          {children}

          {notice}

          {/* The payment choice. The Pay button in the bar below belongs to
              this form (form="pay-form"), so it sends the picked method. */}
          <form id="pay-form" action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="booking_id" value={bookingId} />
            {isFree ? (
              <p className="rounded-[14px] border border-line bg-white px-3.5 py-3 text-sm text-ink">
                Your voucher covers the whole class, so there&apos;s nothing to pay. Just confirm your booking.
              </p>
            ) : (
              <RadioGroup legend="Pay with" name="method">
                {METHODS.map(({ value, label, icon: Icon }) => (
                  <RadioOption
                    key={value}
                    name="method"
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                    disabled={pending}
                    label={
                      <span className="flex items-center gap-2">
                        <Icon aria-hidden="true" className="size-4.5 shrink-0 text-brown" />
                        {label}
                      </span>
                    }
                    aside="via PayMongo"
                  />
                ))}
              </RadioGroup>
            )}
            {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
            {!isFree && (
              <p className="text-xs leading-relaxed text-muted">
                You&apos;ll pay on PayMongo&apos;s secure page, then come back here. We never see your card or
                account numbers.
              </p>
            )}
          </form>

          {/* The manual transfer backup: only if the admin turned it on in
              Settings. <details> opens and closes even before JavaScript loads. */}
          {manual && !isFree && (
            <details className="group rounded-[14px] border border-line bg-card">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[14px] px-3.5 py-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown [&::-webkit-details-marker]:hidden">
                <Landmark aria-hidden="true" className="size-4.5 shrink-0 text-brown" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">PayMongo not working?</span>
                  <span className="block text-xs text-muted">Pay by GCash or BPI transfer and upload a screenshot</span>
                </span>
                <span aria-hidden="true" className="text-xs font-semibold text-brown group-open:hidden">
                  Show
                </span>
                <span aria-hidden="true" className="hidden text-xs font-semibold text-brown group-open:inline">
                  Hide
                </span>
              </summary>
              <div className="border-t border-line px-3.5 pt-3 pb-4">
                <ManualTransfer bookingId={bookingId} total={total} {...manual} />
              </div>
            </details>
          )}

          <p className="pb-2 text-center text-[11px] leading-relaxed text-muted">
            There are no cash refunds. See the{" "}
            <a
              href="/policies#cancellation"
              target="_blank"
              rel="noopener"
              className="font-semibold text-brown underline underline-offset-2"
            >
              cancellation policy
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>
        </div>

        <BookingAside
          total={total}
          action={
            <Button type="submit" form="pay-form" fullWidth disabled={pending}>
              {isFree
                ? pending
                  ? "Confirming…"
                  : "Confirm my free booking"
                : pending
                  ? "Opening PayMongo…"
                  : `Pay ${total} with ${BUTTON_NAMES[method]}`}
            </Button>
          }
          note={
            isFree
              ? "Your seat is booked as soon as you confirm."
              : "Your seat is booked as soon as PayMongo tells us you paid."
          }
        />
      </BookingColumns>
    </div>
  );
}

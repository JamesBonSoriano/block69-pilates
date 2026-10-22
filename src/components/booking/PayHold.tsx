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
// PAYMENT BUTTONS: placeholders for now. PayMongo (GCash, Maya, card) and
// the manual GCash / BPI transfer are built in Step 12.

import { CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BookingAside, BookingColumns } from "@/components/booking/BookingLayout";
import { HoldExpired } from "@/components/booking/HoldExpired";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCountdown } from "@/lib/booking-rules";
import { cn } from "@/lib/cn";

type PayHoldProps = {
  secondsLeft: number; // from the database, when the page was drawn
  holdMinutes: number; // for the "seat released" text
  sessionId: string; // for "Try this class again"
  bookingId: string; // so "Try this class again" keeps this hold's choices
  total: string; // already formatted, e.g. "₱500"
  manualPaymentEnabled: boolean; // show the GCash / BPI transfer backup?
  children: ReactNode; // the booking summary card (drawn on the server)
};

// When to tell screen readers how much time is left (seconds).
// (Reading out every second would be far too much.)
const ANNOUNCE_AT = [600, 300, 120, 60];

// The live pay section.
// Takes: the props above.
// Gives back: the countdown, the summary, the payment placeholders and the
// Pay bar; or "Your seat was released" once the time is up.
export function PayHold({
  secondsLeft,
  holdMinutes,
  sessionId,
  bookingId,
  total,
  manualPaymentEnabled,
  children,
}: PayHoldProps) {
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

          {/* Where the payment buttons go (Step 12) */}
          <section aria-labelledby="pay-with" className="flex flex-col gap-2">
            <h2 id="pay-with" className="font-sans text-xs font-semibold text-brown">
              Pay with
            </h2>
            <ul className="flex flex-col gap-2">
              <PaymentPlaceholder icon={Wallet} label="GCash" via="via PayMongo" />
              <PaymentPlaceholder icon={Smartphone} label="Maya" via="via PayMongo" />
              <PaymentPlaceholder icon={CreditCard} label="Credit or debit card" via="via PayMongo" />
            </ul>
            <p className="text-xs leading-relaxed text-muted">
              Online payment is coming in Step 12. Until then, your seat is only held, not booked.
            </p>
          </section>

          {/* The manual transfer backup: only if the admin turned it on in Settings */}
          {manualPaymentEnabled && (
            <section aria-labelledby="manual-pay" className="flex flex-col gap-2">
              <h2 id="manual-pay" className="font-sans text-xs font-semibold text-brown">
                PayMongo not working?
              </h2>
              <ul className="flex flex-col gap-2">
                <PaymentPlaceholder
                  icon={Landmark}
                  label="Pay by GCash or BPI transfer"
                  via="Upload a screenshot"
                />
              </ul>
            </section>
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
            <Button fullWidth disabled>
              Pay {total}
            </Button>
          }
          note="The Pay button turns on in Step 12 (PayMongo test mode)."
        />
      </BookingColumns>
    </div>
  );
}

// One payment choice, shown greyed out until Step 12.
// Takes: an icon, the method's name and a small line on the right.
// Gives back: a list item that looks like a payment option but can't be
// picked (its badge says "Coming in Step 12", which screen readers read too).
function PaymentPlaceholder({
  icon: Icon,
  label,
  via,
}: {
  icon: typeof Wallet;
  label: string;
  via: string;
}) {
  return (
    <li
      className="flex min-h-11 items-center gap-3 rounded-[14px] border border-line bg-white px-3.5 py-3 text-sm text-ink opacity-60"
    >
      <Icon aria-hidden="true" className="size-4.5 shrink-0 text-brown" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="block text-xs text-muted">{via}</span>
      </span>
      <Badge variant="neutral">Coming in Step 12</Badge>
    </li>
  );
}

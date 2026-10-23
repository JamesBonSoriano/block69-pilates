"use client";
// The form on the transfer page: the class picker (month navigator, date
// chips and classes, drawn on the server and passed in as children) plus the
// summary card (laptop) / sticky bar (phone) with "Move my booking".
// Where it's used: src/app/(client)/account/bookings/[bookingId]/transfer/page.tsx.
//
// "use client" = it shows the picked new class in the summary straight away,
// "Moving…" while the server works, and the error if the move was refused
// (e.g. someone took the last seat a moment ago).
// It's a normal form, so it also works before the page's JavaScript loads.

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { BookingAside, BookingColumns } from "@/components/booking/BookingLayout";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Overline } from "@/components/ui/Overline";
import { transferBooking } from "@/lib/account/actions";
import { emptyTransferBookingState } from "@/lib/account/form-state";

type TransferFormProps = {
  bookingId: string;
  paidLabel: string; // e.g. "₱550" (already paid, nothing more to pay)
  // Every class that can be picked: id -> its date and time, ready to show
  sessionLabels: Record<string, { date: string; time: string }>;
  note: ReactNode; // laptop only: a reminder under the button
  children: ReactNode; // the class picker (radio cards named "session_id")
};

// The transfer form.
// Takes: the props above.
// Gives back: the form with the class picker on the left (phone: on top) and
// the summary card / sticky bar with the picked class and the button.
export function TransferForm({ bookingId, paidLabel, sessionLabels, note, children }: TransferFormProps) {
  // pending = true while the server is working (stops double clicks)
  const [state, formAction, pending] = useActionState(transferBooking, emptyTransferBookingState);
  const formRef = useRef<HTMLFormElement>(null);
  // The new class picked (its id), and "please pick one first"
  const [selected, setSelected] = useState<string | null>(null);
  const [needsPick, setNeedsPick] = useState(false);

  // Listen to the class radio buttons (drawn on the server, inside this form)
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const onChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === "session_id") {
        setSelected(target.value);
        setNeedsPick(false);
      }
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);

  const picked = selected ? sessionLabels[selected] : undefined;

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="booking_id" value={bookingId} />
      <BookingColumns>
        <div className="flex min-w-0 flex-col gap-5">
          {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
          {children}
        </div>
        <BookingAside
          totalLabel="Already paid"
          total={paidLabel}
          details={
            <div className="flex flex-col gap-1" aria-live="polite">
              <Overline as="h2">New class</Overline>
              <p className="text-sm font-semibold text-ink">{picked ? picked.date : "Pick a date and time"}</p>
              {picked && <p className="text-sm text-muted">{picked.time}</p>}
            </div>
          }
          action={
            <>
              <Button
                type="submit"
                fullWidth
                disabled={pending}
                onClick={(event) => {
                  // Nothing picked: the browser's own "required" bubble may
                  // point at a class on a hidden date, so say it here instead
                  if (!picked) {
                    event.preventDefault();
                    setNeedsPick(true);
                  }
                }}
              >
                {pending ? "Moving…" : "Move my booking"}
              </Button>
              {needsPick && (
                <p role="alert" className="mt-2 text-xs font-semibold text-error">
                  Please pick the new class first: choose a date, then a time.
                </p>
              )}
            </>
          }
          note={note}
        />
      </BookingColumns>
    </form>
  );
}

"use client";
// The form on the transfer page: the class list (drawn on the server and
// passed in as children) plus the sticky "Move my booking" bar.
// Where it's used: src/app/(client)/account/bookings/[bookingId]/transfer/page.tsx.
//
// "use client" = it shows "Moving…" while the server works, and the error if
// the move was refused (e.g. someone took the last seat a moment ago).
// It's a normal form, so it also works before the page's JavaScript loads.

import type { ReactNode } from "react";
import { useActionState } from "react";
import { BookingAside, BookingColumns } from "@/components/booking/BookingLayout";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { transferBooking } from "@/lib/account/actions";
import { emptyTransferBookingState } from "@/lib/account/form-state";

type TransferFormProps = {
  bookingId: string;
  paidLabel: string; // e.g. "₱550" (already paid, nothing more to pay)
  note: ReactNode; // laptop only: a reminder under the button
  children: ReactNode; // the class choices (radio cards named "session_id")
};

// The transfer form.
// Takes: the props above.
// Gives back: the form with the classes on the left (phone: on top) and the
// sticky bar / side card with the button.
export function TransferForm({ bookingId, paidLabel, note, children }: TransferFormProps) {
  // pending = true while the server is working (stops double clicks)
  const [state, formAction, pending] = useActionState(transferBooking, emptyTransferBookingState);

  return (
    <form action={formAction}>
      <input type="hidden" name="booking_id" value={bookingId} />
      <BookingColumns>
        <div className="flex min-w-0 flex-col gap-5">
          {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
          {children}
        </div>
        <BookingAside
          totalLabel="Already paid"
          total={paidLabel}
          action={
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Moving…" : "Move my booking"}
            </Button>
          }
          note={note}
        />
      </BookingColumns>
    </form>
  );
}

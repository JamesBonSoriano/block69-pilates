"use client";
// The "Change details" button on the pay page.
// Where it's used: the booking summary card on /book/pay/[bookingId].
//
// It gives up the person's seat hold RIGHT AWAY (releaseHold() in
// src/lib/booking/actions.ts, which calls release_my_hold() in the database)
// and takes them back to step 2 for the same class, with their choices
// filled in. The note under the button says the seat is let go, so nobody is
// surprised if the class fills up in the meantime.
// "use client" = it can show "Releasing…" and an error without reloading.
// It's a normal form, so it works before the page's JavaScript has loaded too.

import { Pencil } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { releaseHold } from "@/lib/booking/actions";
import { emptyReleaseHoldState } from "@/lib/booking/form-state";

// The button.
// Takes: the booking id.
// Gives back: a small form with the button, a short note, and any error.
export function ChangeDetailsButton({ bookingId }: { bookingId: string }) {
  // pending = true while the server is working (stops double clicks)
  const [state, formAction, pending] = useActionState(releaseHold, emptyReleaseHoldState);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-line pt-3">
      <input type="hidden" name="booking_id" value={bookingId} />
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button type="submit" variant="secondary" disabled={pending} className="sm:shrink-0">
          <Pencil aria-hidden="true" className="size-4" />
          {pending ? "Releasing your seat…" : "Change details"}
        </Button>
        <p className="text-xs leading-relaxed text-muted">
          This lets go of your held seat so you can change your choices. If the class fills up in
          the meantime, you can pick another one.
        </p>
      </div>
    </form>
  );
}

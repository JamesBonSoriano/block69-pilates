"use client";
// The "Re-schedule" button on the admin manage page, and the box it opens
// (Version 1.6). The admin picks another open class and writes a reason;
// the move is free (same payment and inclusions).
// Where it's used: src/app/admin/(panel)/appointments/[bookingId]/manage/page.tsx
// (only for confirmed bookings, or bookings in a class the cafe cancelled).
//
// The class list comes from the page: only classes that can still be booked
// right now (open, not started, before the 8:00 AM cutoff, a seat free).
// Sending runs rescheduleBooking() (src/lib/admin/actions.ts), and the
// database checks every rule again with the classes locked
// (admin_reschedule_booking, migration 24), so a class that filled up in the
// meantime is refused with a plain message.
// After the move, the box says whether the client's email went out, and
// "Open the new booking" goes to the new booking's page.
//
// "use client" = it opens a box (<dialog>) and shows "Saving…".

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useId, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { rescheduleBooking } from "@/lib/admin/actions";
import { emptyRescheduleState } from "@/lib/admin/form-state";

type RescheduleBoxProps = {
  bookingId: string;
  guestName: string;
  classLabel: string; // the booking's class now, e.g. "Thu, Nov 19 · 9:00 – 9:50 AM"
  classOptions: SelectOption[]; // the classes it can move to (value = class id)
};

// The button + box.
// Takes: the props above.
// Gives back: a primary button and the box it opens (or a note when no class
// can take the booking right now).
export function RescheduleBox({ bookingId, guestName, classLabel, classOptions }: RescheduleBoxProps) {
  const [state, formAction, pending] = useActionState(rescheduleBooking, emptyRescheduleState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();
  const classId = useId();
  const reasonId = useId();

  // Sends the form. (onSubmit, not action={...}: React would empty the form
  // after a refused move, and the admin would lose what they typed.)
  // Takes: the submit event. Gives back: nothing.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  if (classOptions.length === 0) {
    return <p className="text-sm text-muted">No open class can take this booking right now (all are full, closed or past their cutoff).</p>;
  }

  return (
    <>
      <Button aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}>
        Re-schedule
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-admin-line bg-white p-6 text-ink backdrop:bg-ink/50"
      >
        {state.done ? (
          // ---- After the move ----
          <div className="flex flex-col gap-4">
            <CircleCheck aria-hidden="true" className="size-8 text-success" />
            <h2 id={titleId} className="text-xl font-semibold">
              Re-scheduled
            </h2>
            <p className="text-sm leading-relaxed">{state.done.message}</p>
            <FormMessage tone={state.done.emailSent ? "success" : "info"}>{state.done.emailNote}</FormMessage>
            <Button fullWidth onClick={() => router.push(`/admin/appointments/${state.done?.newBookingId}`)}>
              Open the new booking
            </Button>
          </div>
        ) : (
          // ---- Pick a class and write why ----
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="booking_id" value={bookingId} />
            <div>
              <h2 id={titleId} className="text-xl font-semibold">
                Re-schedule
              </h2>
              <p className="text-sm text-muted">
                {guestName} · now {classLabel}
              </p>
            </div>
            <p className="rounded-xl bg-admin-bg px-4 py-3 text-sm leading-relaxed">
              Free: the payment, drink and mat rental move to the new class. The client gets an update in their
              account and an email.
            </p>
            <Select
              id={classId}
              label="Move to"
              name="session_id"
              options={classOptions}
              placeholder="Choose a class"
              required
              hint="Only open classes with a free seat, before the 8:00 AM cutoff on class day."
            />
            <Textarea
              id={reasonId}
              label="Reason (required)"
              name="reason"
              required
              maxLength={500}
              rows={3}
              placeholder="e.g. Client asked by message to move to Saturday"
              hint="Saved with the booking, and included in the email to the client."
            />
            {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button type="submit" disabled={pending} fullWidth className="sm:flex-1">
                {pending ? "Saving…" : "Re-schedule"}
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

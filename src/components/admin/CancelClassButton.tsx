"use client";
// The "Cancel class" button and the confirm box it opens.
// Where it's used: the class cards on the admin Dashboard
// (ClassCard.tsx) and the admin booking details page.
//
// Nothing is cancelled straight away. The box first explains what happens:
// the class becomes "cancelled", nobody can book it, and the clients who are
// booked KEEP their bookings and can move to another class for free from
// My Bookings (transfer_my_booking skips the 24-hour and once-only rules for
// a cancelled class). Only "Yes, cancel this class" runs cancelClass()
// (src/lib/admin/actions.ts), which calls admin_cancel_session().
//
// "use client" = it opens a box (<dialog>) and shows "Cancelling…".

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useId, useRef } from "react";
import { cancelClass } from "@/lib/admin/actions";
import { emptyCancelClassState } from "@/lib/admin/form-state";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";

type CancelClassButtonProps = {
  sessionId: string;
  classLabel: string; // e.g. "Sat, Oct 24 · 9:00 – 9:50 AM"
  bookedCount: number; // seats taken right now (when the page was drawn)
  className?: string; // extra classes for the button
};

// The Cancel class button + box.
// Takes: the props above.
// Gives back: a red outline button, and the box it opens.
export function CancelClassButton({ sessionId, classLabel, bookedCount, className }: CancelClassButtonProps) {
  const [state, formAction, pending] = useActionState(cancelClass, emptyCancelClassState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();

  // Closes the box. If the class was cancelled, the page is drawn again now
  // (not earlier, so the admin could read the result first).
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
        className={className}
      >
        Cancel class
      </Button>

      {/* <dialog> + showModal(): a real pop-up box. The page behind can't be
          clicked, Escape closes it, and screen readers know it's a box. */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={handleClose}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-admin-line bg-white p-6 text-ink backdrop:bg-ink/50"
      >
        {state.done ? (
          // ---- After cancelling ----
          <div className="flex flex-col gap-4">
            <CircleCheck aria-hidden="true" className="size-8 text-success" />
            <h2 id={titleId} className="text-xl font-semibold">
              Class cancelled
            </h2>
            <p className="text-sm text-muted">{classLabel}</p>
            <p className="text-sm leading-relaxed">
              {state.done.bookedCount === 0
                ? "Nobody was booked in it. It no longer shows as open for booking."
                : `${state.done.bookedCount} booking${state.done.bookedCount === 1 ? " was" : "s were"} holding a seat. ` +
                  "Those clients keep their bookings and will see a free transfer in My Bookings."}
            </p>
            {state.done.bookedCount > 0 && (
              <FormMessage tone="info">
                Emails aren&apos;t sent yet (they come in a later step), so please message the booked clients
                yourself. Walk-in guests can only be reached by phone.
              </FormMessage>
            )}
            <Button fullWidth onClick={() => dialogRef.current?.close()}>
              Done
            </Button>
          </div>
        ) : (
          // ---- Before cancelling: what it means ----
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="session_id" value={sessionId} />
            <h2 id={titleId} className="text-xl font-semibold">
              Cancel this class?
            </h2>
            <p className="text-sm font-semibold text-brown">{classLabel}</p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
              <li>Nobody will be able to book it any more, online or as a walk-in.</li>
              <li>
                {bookedCount === 0
                  ? "Nobody is booked in it right now."
                  : `${bookedCount} ${bookedCount === 1 ? "person is" : "people are"} booked. They keep their booking and can move to any open class for free from My Bookings, even less than 24 hours before class.`}
              </li>
              <li>There are no cash refunds. Moving to another class is how clients get their class back.</li>
              <li>This can&apos;t be undone from the website.</li>
            </ul>
            {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button type="submit" variant="danger" disabled={pending} fullWidth className="sm:flex-1">
                {pending ? "Cancelling…" : "Yes, cancel this class"}
              </Button>
              <Button variant="secondary" fullWidth className="sm:flex-1" onClick={() => dialogRef.current?.close()}>
                Keep the class
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

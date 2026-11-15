"use client";
// The "Reject payment" button on the admin manage page, and the box it opens
// (Version 1.6). The admin must write why the GCash / BPI screenshot is
// rejected; the reason is saved with the booking (admins only).
// Where it's used: src/app/admin/(panel)/appointments/[bookingId]/manage/page.tsx
// (only while a manual transfer is waiting to be checked).
// Sending runs rejectPayment() (src/lib/admin/actions.ts); the database
// checks everything again (admin_reject_payment, migration 24).
//
// "use client" = it opens a box (<dialog>) and shows "Saving…".

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useId, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { Textarea } from "@/components/ui/Textarea";
import { rejectPayment } from "@/lib/admin/actions";
import { emptySaveState } from "@/lib/admin/form-state";

// The button + box.
// Takes: the payment id, and the guest's name and the amount (for the text).
// Gives back: a red outline button and the box it opens.
export function RejectPaymentButton({ paymentId, guestName, amount }: { paymentId: string; guestName: string; amount: string }) {
  const [state, formAction, pending] = useActionState(rejectPayment, emptySaveState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();
  const reasonId = useId();

  // Closes the box. After a reject the page is drawn again (not earlier, so
  // the admin can read the result first).
  // Takes: nothing. Gives back: nothing.
  function handleClose() {
    if (state.saved) router.refresh();
  }

  // Sends the form. (onSubmit, not action={...}: React would empty the form
  // after a refused reject, and the admin would lose the reason they typed.)
  // Takes: the submit event. Gives back: nothing.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <>
      <Button variant="danger" aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()}>
        Reject payment
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={handleClose}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-admin-line bg-white p-6 text-ink backdrop:bg-ink/50"
      >
        {state.saved ? (
          // ---- After the reject ----
          <div className="flex flex-col gap-4">
            <CircleCheck aria-hidden="true" className="size-8 text-success" />
            <h2 id={titleId} className="text-xl font-semibold">
              Payment rejected
            </h2>
            <p className="text-sm leading-relaxed">{state.saved}</p>
            <Button fullWidth onClick={() => dialogRef.current?.close()}>
              Close
            </Button>
          </div>
        ) : (
          // ---- The reason ----
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input type="hidden" name="payment_id" value={paymentId} />
            <div>
              <h2 id={titleId} className="text-xl font-semibold">
                Reject this payment?
              </h2>
              <p className="text-sm text-muted">
                {amount} from {guestName}
              </p>
            </div>
            <p className="rounded-xl bg-admin-bg px-4 py-3 text-sm leading-relaxed">
              The booking ends and the seat is freed for someone else. The client sees &quot;Payment not approved&quot;
              in their account.
            </p>
            <Textarea
              id={reasonId}
              label="Reason (required)"
              name="reason"
              required
              maxLength={500}
              rows={3}
              placeholder="e.g. The amount didn't arrive in the cafe's GCash"
              hint="Saved with the booking. Only admins can see it, so please also message the client."
            />
            {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button type="submit" variant="danger" disabled={pending} fullWidth className="sm:flex-1">
                {pending ? "Saving…" : "Reject payment"}
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

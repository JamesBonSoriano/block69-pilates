"use client";
// The "Cancel appointment" button on the admin manage page, and the box it
// opens (Version 1.7, PDF admin #4). It replaced the old 50%-or-no-credit
// box (BookingChangeBox).
// Where it's used: src/app/admin/(panel)/appointments/[bookingId]/manage/page.tsx
// (only for confirmed bookings and late payments).
//
// Three choices, and a reason is ALWAYS required:
//   a) Free re-schedule (recommended, picked at the start): cancel and give
//      the client a personal 100% code for one class
//   b) Normal policy: the same rules as when the client cancels (the box says
//      what that gives right now: 100% code, 50% code or no credit)
//   c) Refunded outside the website: cancel, no code, and the payment is
//      marked refunded so Earnings stops counting it
// In all three the seat is freed and the client gets a bell update and an
// email. Walk-ins have no account, so they can't get a code.
// Sending runs cancelAppointment() (src/lib/admin/actions.ts); the database
// checks everything again (admin_cancel_appointment, migration 27).
//
// "use client" = it opens a box (<dialog>) and remembers the choice.

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { Textarea } from "@/components/ui/Textarea";
import { cancelAppointment } from "@/lib/admin/actions";
import { emptyCancelAppointmentState } from "@/lib/admin/form-state";
import type { AdminChangeRule } from "@/types/app";

type Choice = "free" | "policy" | "refunded";

// What "Normal policy" gives right now, for each rule word
// (admin_change_rule; the database uses the same mapping).
// Gives back: the words, and whether it gives a code (walk-ins can't get one).
function policyOutcome(rule: AdminChangeRule): {
  text: string;
  givesCode: boolean;
} {
  switch (rule) {
    case "transfer":
    case "already_transferred":
    case "free_transfer":
    case "late_payment":
      return {
        text: "Right now: a 100% code (the client could still move for free).",
        givesCode: true,
      };
    case "voucher":
      return {
        text: "Right now: a 50% code (12 to 24 hours before class).",
        givesCode: true,
      };
    default:
      // "no_credit", "started", "move_window_ended"
      return {
        text: "Right now: no credit (less than 12 hours before class, or it has started).",
        givesCode: false,
      };
  }
}

type CancelAppointmentBoxProps = {
  bookingId: string;
  guestName: string;
  classLabel: string; // e.g. "Sat, Oct 25 · 9:00 – 9:50 AM"
  rule: AdminChangeRule; // what the cancellation rules say right now
  voucherAllowed: boolean; // false for walk-ins (no account for a code)
};

// The button + box.
// Takes: the props above.
// Gives back: a red outline button and the box it opens.
export function CancelAppointmentBox({
  bookingId,
  guestName,
  classLabel,
  rule,
  voucherAllowed,
}: CancelAppointmentBoxProps) {
  const [state, formAction, pending] = useActionState(
    cancelAppointment,
    emptyCancelAppointmentState,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const titleId = useId();
  const policy = policyOutcome(rule);
  // Which choices a walk-in can't use (they would give a code)
  const blocked: Record<Choice, boolean> = {
    free: !voucherAllowed,
    policy: !voucherAllowed && policy.givesCode,
    refunded: false,
  };
  // Start on the recommended "Free re-schedule" (or "Refunded" for a walk-in)
  const [choice, setChoice] = useState<Choice>(
    voucherAllowed ? "free" : "refunded",
  );

  // The three choices, in order, with their words
  const choices: { value: Choice; label: string; description: string }[] = [
    {
      value: "free",
      label: "Free re-schedule",
      description:
        "Cancel and give the client a 100% code for one class (class fee, 60 days, one use). The payment stays.",
    },
    {
      value: "policy",
      label: "Normal policy",
      description: `The same rules as when the client cancels. ${policy.text}`,
    },
    {
      value: "refunded",
      label: "Refunded outside the website",
      description:
        "Cancel with no code. The payment is marked refunded, so Earnings no longer counts it.",
    },
  ];

  // Closes the box. After a cancel, the page is drawn again (not earlier, so
  // the admin can read the result first).
  // Takes: nothing. Gives back: nothing.
  function handleClose() {
    if (state.done) router.refresh();
  }

  // Sends the form. (onSubmit, not action={...}: React would empty the form
  // after a refused cancel, and the admin would lose the reason they typed.)
  // Takes: the submit event. Gives back: nothing.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <>
      <Button
        variant="danger"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        Cancel appointment
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={handleClose}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-admin-line bg-white p-6 text-ink backdrop:bg-ink/50"
      >
        {state.done ? (
          // ---- After the cancel ----
          <div className="flex flex-col gap-4">
            <CircleCheck aria-hidden="true" className="size-8 text-success" />
            <h2 id={titleId} className="text-xl font-semibold">
              Done
            </h2>
            <p className="text-sm leading-relaxed">{state.done.message}</p>
            {state.done.voucherCode && (
              <p className="rounded-xl bg-admin-bg px-4 py-3 text-sm">
                The code:{" "}
                <span className="font-heading text-base font-semibold text-brown">
                  {state.done.voucherCode}
                </span>
              </p>
            )}
            {/* Whether the client's email went out (they also got a bell update) */}
            <FormMessage tone={state.done.emailSent ? "success" : "info"}>
              {state.done.emailNote}
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
                Cancel appointment
              </h2>
              <p className="text-sm text-muted">
                {guestName} · {classLabel}
              </p>
            </div>
            <p className="rounded-xl bg-admin-bg px-4 py-3 text-sm leading-relaxed">
              The seat is freed and the client is told by email and in their
              bell.
            </p>

            <RadioGroup legend="How should it be cancelled?" name="choice">
              {choices.map((item) => (
                <RadioOption
                  key={item.value}
                  name="choice"
                  value={item.value}
                  label={item.label}
                  description={
                    blocked[item.value]
                      ? "Walk-ins have no account, so they can't get a code."
                      : item.description
                  }
                  aside={
                    item.value === "free" && !blocked.free ? (
                      <Badge variant="success">Recommended</Badge>
                    ) : undefined
                  }
                  checked={choice === item.value}
                  onChange={() => setChoice(item.value)}
                  disabled={blocked[item.value]}
                  required
                />
              ))}
            </RadioGroup>

            <Textarea
              label="Reason (required)"
              name="reason"
              required
              maxLength={500}
              rows={3}
              placeholder="e.g. The instructor is sick"
              hint="Saved with the booking. Only admins can see it."
            />

            {state.error && (
              <FormMessage tone="error">{state.error}</FormMessage>
            )}

            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button
                type="submit"
                variant="danger"
                disabled={pending}
                fullWidth
                className="sm:flex-1"
              >
                {pending ? "Cancelling…" : "Cancel appointment"}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                className="sm:flex-1"
                onClick={() => dialogRef.current?.close()}
              >
                Go back
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

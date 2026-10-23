"use client";
// One button that runs one admin Server Action, optionally after an
// "Are you sure?" box. Used for small actions on a list row:
//   Pricing:  Turn off / Turn on a promo code
//   Payments: Approve / Reject a manual transfer
//   Users:    Deactivate / Reactivate, Make admin / Make client
// Where it's used: the pages in src/app/admin/ (Pricing, Payments, Users).
//
// The values the action needs (e.g. voucher_id) are sent as hidden fields.
// The database checks everything again (e.g. an admin can't deactivate
// their own account), so this button is never the only safety check.
//
// "use client" = it opens the box (<dialog>), shows "Saving…" and the answer.

import { useActionState, useId, useRef } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { emptySaveState, type AdminSaveState } from "@/lib/admin/form-state";

type ConfirmActionButtonProps = {
  action: (previous: AdminSaveState, formData: FormData) => Promise<AdminSaveState>;
  fields: Record<string, string>; // hidden fields, e.g. { voucher_id: "...", enabled: "false" }
  label: string; // the button text, e.g. "Turn off"
  srLabel?: string; // extra words for screen readers, e.g. " code SUMMER20"
  variant?: ButtonVariant;
  // Show a box first? Its title, explanation and confirm button text.
  confirm?: { title: string; body: string; confirmLabel: string };
  className?: string;
};

// The button (and its box).
// Takes: the props above.
// Gives back: the button, the box if `confirm` is set, and the answer under it.
export function ConfirmActionButton({
  action,
  fields,
  label,
  srLabel,
  variant = "secondary",
  confirm,
  className,
}: ConfirmActionButtonProps) {
  const [state, formAction, pending] = useActionState(action, emptySaveState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // The hidden fields, shared by the plain form and the box's form
  const hidden = Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <div className="flex flex-col items-start gap-2">
      {confirm ? (
        // With a box: this button only opens it
        <Button
          variant={variant}
          aria-haspopup="dialog"
          disabled={pending}
          onClick={() => dialogRef.current?.showModal()}
          className={className}
        >
          {pending ? "Saving…" : label}
          {srLabel && <span className="sr-only">{srLabel}</span>}
        </Button>
      ) : (
        // No box: the button sends the form straight away
        <form action={formAction}>
          {hidden}
          <Button type="submit" variant={variant} disabled={pending} className={className}>
            {pending ? "Saving…" : label}
            {srLabel && <span className="sr-only">{srLabel}</span>}
          </Button>
        </form>
      )}

      {confirm && (
        // <dialog> + showModal(): a real pop-up box (Escape closes it)
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-admin-line bg-white p-6 text-ink backdrop:bg-ink/50"
        >
          <form
            action={(formData) => {
              // Close the box, then run the action (the answer shows by the button)
              dialogRef.current?.close();
              formAction(formData);
            }}
            className="flex flex-col gap-4"
          >
            {hidden}
            <h2 id={titleId} className="text-xl font-semibold">
              {confirm.title}
            </h2>
            <p className="text-sm leading-relaxed">{confirm.body}</p>
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <Button type="submit" variant={variant === "danger" ? "danger" : "primary"} fullWidth className="sm:flex-1">
                {confirm.confirmLabel}
              </Button>
              <Button variant="secondary" fullWidth className="sm:flex-1" onClick={() => dialogRef.current?.close()}>
                Go back
              </Button>
            </div>
          </form>
        </dialog>
      )}

      {/* The answer, right under the button */}
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.saved && (
        <p key={state.savedAt} role="status" className="text-xs font-semibold text-success">
          {state.saved}
        </p>
      )}
    </div>
  );
}

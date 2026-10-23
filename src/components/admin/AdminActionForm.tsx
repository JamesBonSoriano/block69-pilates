"use client";
// A form for the admin setup pages that sends its fields to one Server
// Action (src/lib/admin/setup-actions.ts) and shows the answer under the
// fields: "Saved." in green, or the database's message in red.
// Where it's used: Pricing, Settings, Schedule, Content (src/app/admin/...).
//
// The page draws the fields (Inputs with defaultValue = the saved value) and
// passes them in as children; this component adds the <form>, the Save
// button with "Saving…", and the message.
//
// "use client" = it shows "Saving…" and the answer without a page reload
// (useActionState).
//
// Why onSubmit instead of action={...}: React empties a form after its
// action has run, even when the database REFUSED the values, so the admin
// would lose what they typed. Sending it ourselves keeps the fields as they
// are. Set resetOnSave to empty the form after a successful save (e.g. the
// "Create a promo code" form, ready for the next code).

import type { FormEvent, ReactNode } from "react";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { emptySaveState, type AdminSaveState } from "@/lib/admin/form-state";
import { cn } from "@/lib/cn";

type AdminActionFormProps = {
  // The Server Action that saves the form
  action: (previous: AdminSaveState, formData: FormData) => Promise<AdminSaveState>;
  submitLabel: string; // e.g. "Save prices"
  pendingLabel?: string; // e.g. "Saving…"
  buttonVariant?: ButtonVariant;
  id?: string; // lets a button elsewhere on the page send this form (form="<id>")
  className?: string; // layout of the form
  footerNote?: ReactNode; // a small grey line next to the button
  resetOnSave?: boolean; // empty the fields after a successful save
  children: ReactNode; // the fields
};

// The admin form.
// Takes: the props above.
// Gives back: the form with the fields, the answer and the button row.
export function AdminActionForm({
  action,
  submitLabel,
  pendingLabel = "Saving…",
  buttonVariant = "primary",
  id,
  className,
  footerNote,
  resetOnSave = false,
  children,
}: AdminActionFormProps) {
  const [state, formAction, pending] = useActionState(action, emptySaveState);
  const formRef = useRef<HTMLFormElement>(null);

  // After a successful save, empty the form if asked to
  useEffect(() => {
    if (resetOnSave && state.savedAt) formRef.current?.reset();
  }, [resetOnSave, state.savedAt]);

  // Sends the form to the Server Action without React's automatic reset.
  // Takes: the submit event. Gives back: nothing.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // startTransition: lets useActionState show "Saving…" while it runs
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} id={id} onSubmit={handleSubmit} className={cn("flex flex-col gap-4", className)}>
      {children}

      {/* key = savedAt: the same "Saved." twice still shows as a new message */}
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.saved && (
        <div key={state.savedAt}>
          <FormMessage tone="success">{state.saved}</FormMessage>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {footerNote ? <p className="text-xs text-muted">{footerNote}</p> : <span aria-hidden="true" />}
        <Button type="submit" variant={buttonVariant} disabled={pending} className="sm:shrink-0">
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

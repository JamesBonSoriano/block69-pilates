"use client";
// The on/off switch for the day-before reminder email (Notifications page,
// docs/designs/Notifications.html).
// Where it's used: src/app/(client)/account/notifications/page.tsx.
//
// It's a small form: pressing the switch sends the OPPOSITE of the current
// choice to setEmailReminders() (src/lib/account/actions.ts), which saves it
// to profiles.email_reminders. While saving, the switch already shows the
// new position. If saving fails, it flips back and shows why.
// It works before the page's JavaScript has loaded too (a normal form).

import { useActionState } from "react";
import { FormMessage } from "@/components/ui/FormMessage";
import { setEmailReminders } from "@/lib/account/actions";
import { cn } from "@/lib/cn";

// The switch.
// Takes: the saved choice when the page was drawn, and the id of the text
// that names the switch (for screen readers).
// Gives back: the switch, and an error message if saving failed.
export function ReminderSwitch({ initialValue, labelId }: { initialValue: boolean; labelId: string }) {
  const [state, formAction, pending] = useActionState(setEmailReminders, { value: initialValue });
  const saved = state.value ?? initialValue;
  // While saving, show where it's going (feels instant)
  const shown = pending ? !saved : saved;

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      {/* What to save: the opposite of the saved choice */}
      <input type="hidden" name="value" value={String(!saved)} />
      <button
        type="submit"
        role="switch"
        aria-checked={shown}
        aria-labelledby={labelId}
        disabled={pending}
        // 44px tall tap area around the smaller switch shape
        className="inline-flex min-h-11 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-7 w-12 rounded-full p-0.75 transition-colors",
            shown ? "justify-end bg-brown" : "justify-start bg-tan",
          )}
        >
          <span className="size-5.5 rounded-full bg-white shadow-sm" />
        </span>
      </button>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
    </form>
  );
}

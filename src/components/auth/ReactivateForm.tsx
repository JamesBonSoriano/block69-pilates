"use client";
// The buttons on the "Welcome back! Reactivate your account?" page
// (Version 1.4).
// Where it's used: src/app/(auth)/reactivate/page.tsx.
//
// "use client" = it shows "Reactivating…" and any error without a page
// reload. The work happens in reactivateAccount() (src/lib/account/actions.ts),
// and the database's reactivate_my_account() has the final say (only your own
// account, only if you turned it off yourself).

import { useActionState } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { reactivateAccount } from "@/lib/account/actions";
import { emptyAccountFormState } from "@/lib/account/form-state";

// The confirm button, and "Not now" (logs out).
// Takes: next = the safe page to go on to afterwards (or null).
// Gives back: the two buttons. When it works the server sends them on.
export function ReactivateForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(reactivateAccount, emptyAccountFormState);
  return (
    <div className="flex flex-col gap-3">
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <form action={formAction}>
        {/* Hidden: where to go next (the server checks it's safe) */}
        {next && <input type="hidden" name="next" value={next} />}
        <Button type="submit" fullWidth disabled={pending}>
          {pending ? "Reactivating…" : "Yes, reactivate my account"}
        </Button>
      </form>
      {/* Not now: the account stays off and they're logged out */}
      <LogoutButton fullWidth />
    </div>
  );
}

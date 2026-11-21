"use client";
// Lets staff unlock individual profile fields and save only after editing a value.
import { Pencil } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { BirthdayInput } from "@/components/ui/BirthdayInput";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { updateUser } from "@/lib/admin/user-actions";

type Details = { full_name: string; mobile: string; instagram: string; birthday: string };

// Keeps the submitted values and the dirty check tied to the visible inputs.
export function UserDetailsEditor({ userId, email, initial }: { userId: string; email: string; initial: Details }) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const dirty = (Object.keys(saved) as (keyof Details)[]).some((key) => draft[key] !== saved[key]);
  const change = (key: keyof Details, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <AdminActionForm action={updateUser} submitLabel="Save details" submitDisabled={!dirty}
      onSaved={(submission) => setSaved({
        full_name: String(submission.get("full_name") ?? ""), mobile: String(submission.get("mobile") ?? ""),
        instagram: String(submission.get("instagram") ?? ""), birthday: String(submission.get("birthday") ?? ""),
      })}>
      <input type="hidden" name="user_id" value={userId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <PencilField label="Full name">
          {(id, readOnly) => <Input id={id} readOnly={readOnly} label="Full name" name="full_name"
            required maxLength={120} value={draft.full_name} onChange={(event) => change("full_name", event.target.value)} />}
        </PencilField>
        <PencilField label="Mobile">
          {(id, readOnly) => <PhoneInput id={id} readOnly={readOnly} label="Mobile" name="mobile" required value={draft.mobile}
            onInput={(event) => change("mobile", event.currentTarget.value)}
            onChange={(event) => change("mobile", event.currentTarget.value)}
            onPaste={(event) => { if (event.defaultPrevented) change("mobile", event.currentTarget.value); }} />}
        </PencilField>
        <PencilField label="Instagram">
          {(id, readOnly) => <Input id={id} readOnly={readOnly} label="Instagram" name="instagram"
            maxLength={31} value={draft.instagram} onChange={(event) => change("instagram", event.target.value)} />}
        </PencilField>
        <PencilField label="Birthday">
          {(id, readOnly) => <BirthdayInput id={id} readOnly={readOnly} label="Birthday" name="birthday"
            defaultValue={initial.birthday} onValueChange={(value) => change("birthday", value)} />}
        </PencilField>
        <Input label="Email" name="email_shown" defaultValue={email} disabled />
      </div>
    </AdminActionForm>
  );
}

// Read-only inputs still submit saved values to the existing profile action.
function PencilField({ label, children }: { label: string; children: (id: string, readOnly: boolean) => ReactNode }) {
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const id = useId();
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div ref={field} className="min-w-0 flex-1">{children(id, !editing)}</div>
      <Button type="button" variant="secondary" className="mt-5 shrink-0 px-3"
        aria-label={`Edit ${label}`} aria-controls={id} aria-pressed={editing} onClick={() => {
          setEditing(true);
          field.current?.querySelector("input")?.focus();
        }}>
        <Pencil aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

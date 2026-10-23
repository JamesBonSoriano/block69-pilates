"use client";
// The manual GCash / BPI transfer form (the backup when PayMongo isn't
// working). Only shown when the admin turned on "manual payment" in Settings.
// Where it's used: the pay page, inside PayHold.tsx ("PayMongo not working?").
//
// How it works:
//   1. It shows the cafe's GCash and BPI details (from settings) and the
//      EXACT amount to send (the booking's total, worked out by the database).
//   2. The client picks GCash or BPI and a screenshot (an image, 5 MB at most).
//   3. The BROWSER uploads the screenshot straight into the PRIVATE bucket
//      "payment-screenshots", inside a folder named by the client's user id.
//      The storage policies (migration 11) only allow their own folder, and
//      only admins can open other people's files. (Server Actions only take
//      1 MB, too small for phone screenshots, so the upload doesn't go
//      through our server.)
//   4. submitManualTransfer() (src/lib/booking/payment-actions.ts) closes any
//      PayMongo page still open, then submit_manual_payment() checks
//      everything again and sets the booking to "awaiting_verification",
//      which keeps the seat until the cafe approves or rejects it.
//
// "use client" = it reads the picked file and talks to Supabase Storage.

import { ImageUp, Send } from "lucide-react";
import { startTransition, useActionState, useId, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/FormMessage";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { submitManualTransfer } from "@/lib/booking/payment-actions";
import { emptyPaymentState } from "@/lib/booking/form-state";
import { createClient } from "@/lib/supabase/client";

// The private bucket for transfer screenshots (made in migration 10).
const BUCKET = "payment-screenshots";
// The image types the bucket accepts, and the file ending for each.
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
// The biggest screenshot the bucket accepts (5 MB).
const MAX_BYTES = 5 * 1024 * 1024;

type ManualTransferProps = {
  bookingId: string;
  userId: string; // the folder the screenshot goes into
  total: string; // the exact amount to send, e.g. "₱550"
  gcashName: string;
  gcashNumber: string;
  bpiAccountName: string;
  bpiAccountNumber: string;
};

// The form.
// Takes: the props above.
// Gives back: the cafe's account details, the method choice, the screenshot
// picker and the "Send for checking" button.
export function ManualTransfer({
  bookingId,
  userId,
  total,
  gcashName,
  gcashNumber,
  bpiAccountName,
  bpiAccountNumber,
}: ManualTransferProps) {
  const [state, formAction, sending] = useActionState(submitManualTransfer, emptyPaymentState);
  const [method, setMethod] = useState<"gcash" | "bpi">("gcash");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState("");
  const inputId = useId();
  const busy = uploading || sending;

  // Remembers the picked screenshot after checking its type and size.
  // Takes: the file input's change event. Gives back: nothing.
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setProblem("");
    if (picked && !TYPES[picked.type]) {
      setProblem("Please pick a screenshot (JPEG, PNG, WebP or HEIC).");
      setFile(null);
      return;
    }
    if (picked && picked.size > MAX_BYTES) {
      setProblem("That picture is bigger than 5 MB. Please crop it or take a new screenshot.");
      setFile(null);
      return;
    }
    setFile(picked);
  }

  // Uploads the screenshot, then sends the transfer for checking.
  // Takes: the form's submit event. Gives back: nothing.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setProblem("Please add a screenshot of your transfer.");
      return;
    }
    setProblem("");
    setUploading(true);
    // e.g. "<user id>/<booking id>-1729651234567.jpg": a new name every
    // time, so an upload never replaces an older one
    const path = `${userId}/${bookingId}-${Date.now()}.${TYPES[file.type]}`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) {
      console.error("Screenshot upload failed:", error.message);
      setProblem("Sorry, the screenshot couldn't be uploaded. Please check your connection and try again.");
      return;
    }

    const formData = new FormData();
    formData.set("booking_id", bookingId);
    formData.set("method", method);
    formData.set("screenshot_path", path);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-ink">
        Send exactly <span className="font-heading font-semibold text-brown">{total}</span> to one of these
        accounts, then upload a screenshot. Your seat stays held while the cafe checks it.
      </p>

      {/* The cafe's accounts (from Settings) */}
      <dl className="grid gap-2 sm:grid-cols-2">
        <AccountBox title="GCash" name={gcashName} number={gcashNumber} />
        <AccountBox title="BPI" name={bpiAccountName} number={bpiAccountNumber} />
      </dl>

      <RadioGroup legend="I sent it by" name="manual-method" className="grid grid-cols-2 gap-2">
        <RadioOption
          name="manual-method"
          value="gcash"
          label="GCash"
          checked={method === "gcash"}
          onChange={() => setMethod("gcash")}
          disabled={busy}
        />
        <RadioOption
          name="manual-method"
          value="bpi"
          label="BPI"
          checked={method === "bpi"}
          onChange={() => setMethod("bpi")}
          disabled={busy}
        />
      </RadioGroup>

      {/* The screenshot: the real file input is hidden, the label is the button */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-brown">Screenshot of your transfer</span>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={handleFile}
          disabled={busy}
          className="peer sr-only"
        />
        <label
          htmlFor={inputId}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[12px] border border-dashed border-line bg-white px-3.5 py-3 text-sm text-ink hover:border-brown peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brown peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        >
          <ImageUp aria-hidden="true" className="size-4.5 shrink-0 text-brown" />
          <span className="min-w-0 flex-1 truncate">
            {file ? file.name : "Choose a screenshot (image, up to 5 MB)"}
          </span>
          <span className="shrink-0 text-xs font-semibold text-brown">{file ? "Change" : "Browse"}</span>
        </label>
      </div>

      {(problem || state.error) && <FormMessage tone="error">{problem || state.error}</FormMessage>}

      <Button type="submit" variant="secondary" disabled={busy} className="sm:self-start">
        <Send aria-hidden="true" className="size-4" />
        {uploading ? "Uploading screenshot…" : sending ? "Sending…" : "Send for checking"}
      </Button>
    </form>
  );
}

// One of the cafe's accounts.
// Takes: the bank's name, the account name and the number.
// Gives back: a small box (a <dt> + <dd> pair inside the <dl>).
function AccountBox({ title, name, number }: { title: string; name: string; number: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-brown">{title}</dt>
      <dd className="text-sm">
        <span className="block font-semibold text-ink">{number || "Not set up yet"}</span>
        <span className="block text-xs text-muted">{name}</span>
      </dd>
    </div>
  );
}

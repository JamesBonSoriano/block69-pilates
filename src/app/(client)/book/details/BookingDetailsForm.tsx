"use client";
// The booking step 2 form: your details (shown from your profile), health
// notes, drink, voucher code, the Registration Agreement tick (Change 17: the
// not-pregnant tick was removed), and a live price summary.
// After "Change details" on the pay page it starts with the earlier choices.
// Where it's used: src/app/(client)/book/details/page.tsx.
//
// Revisions part 1, item 5:
//   - name, mobile and Instagram are SHOWN, not typed. They come from the
//     profile; "Edit in My Profile" opens My Profile (with a link back here).
//     holdSeat() reads them from the profile on the server.
//   - the mat was chosen on step 1. It's sent as a hidden field and shown in
//     the class card and the price summary ("Change" goes back to step 1).
//   - no "Is this your first Pilates class?" question (the database column
//     stays; book_seat() saves its default, false)
//   - what's typed here (drink, notes, voucher code) is kept in this browser
//     tab while the person goes back to step 1 and returns (sessionStorage)
//
// "use client" = it runs in the browser too, so the total changes straight
// away when a voucher is applied. The real work happens on the server:
// previewVoucher() and holdSeat() in src/lib/booking/actions.ts.
// The total shown here is only a preview. book_seat() in the database works
// out the real one from the settings table.
//
// Double clicks: the Confirm button is disabled while the server is working,
// and even if two clicks got through, book_seat() refuses a second seat in
// the same class and holdSeat() then simply opens the first hold's pay page.

import { Pencil, Tag, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { BookingAside, BookingColumns } from "@/components/booking/BookingLayout";
import { PriceSummary } from "@/components/booking/PriceSummary";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormMessage } from "@/components/ui/FormMessage";
import { Overline } from "@/components/ui/Overline";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { Textarea } from "@/components/ui/Textarea";
import { holdSeat, previewVoucher } from "@/lib/booking/actions";
import { emptyHoldSeatState, type VoucherPreview } from "@/lib/booking/form-state";
import { cn } from "@/lib/cn";
import { formatPeso } from "@/lib/format";

// Where this tab keeps what was typed (only in this browser tab, cleared
// when the tab is closed or the form is sent).
const DRAFT_KEY = "b69-booking-draft";

// What's kept while going back and forth between the steps.
type Draft = { drink_choice?: string; health_notes?: string; voucher_code?: string };

type BookingDetailsFormProps = {
  // The class being booked (already formatted by the page)
  session: {
    id: string;
    dateLabel: string; // "Thursday, 23 October"
    timeLabel: string; // "9:00 – 9:50 AM"
    badgeLabel: string; // "3 of 4 left"
    badgeVariant: BadgeVariant;
  };
  // What we know about the person (from their profile), shown not edited
  profile: { fullName: string; mobile: string; email: string; instagram: string };
  editProfileHref: string; // My Profile, with a link back to this page
  matRental: boolean; // chosen on step 1 (or kept from a released hold)
  changeClassHref: string; // step 1 with this class and mat tick picked again
  classPrice: number; // pesos, from settings
  matPrice: number; // pesos, from settings
  drinkOptions: string[]; // from the drink_options setting
  holdMinutes: number; // how long the seat is held while paying
  lateWarning: boolean; // true = class is less than noCreditHours away
  noCreditHours: number; // 12
  whatToBring: ReactNode; // the "What to bring" card, made by the page
  kept: KeptChoices | null; // choices from a released hold ("Change details"), or null
};

// The choices from a hold the person just gave up with "Change details" (or
// whose timer ran out), so the form starts with them filled in.
// The Registration Agreement tick is NOT kept on purpose: it's confirmed
// again for every new hold.
export type KeptChoices = {
  drinkChoice: string; // "" if none
  matRental: boolean;
  healthNotes: string; // "" if none
  // The old hold's voucher, checked again just now: ok (still works, so it's
  // applied straight away) or not ok (with the reason), or null if none
  voucher: VoucherPreview | null;
};

// A voucher code that passed the "Apply" check.
type AppliedVoucher = { code: string; label: string; discount: number };

// Reads the kept draft from this browser tab.
// Takes: nothing. Gives back: the draft, or null (none, or storage blocked).
function readDraft(): Draft | null {
  try {
    const text = window.sessionStorage.getItem(DRAFT_KEY);
    return text ? (JSON.parse(text) as Draft) : null;
  } catch {
    return null; // private mode or blocked storage: just start empty
  }
}

// Saves (or, with null, deletes) the draft in this browser tab.
// Takes: the draft or null. Gives back: nothing. Never throws.
function writeDraft(draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked: the form still works, it just can't remember
  }
}

// The step 2 form.
// Takes: the props above.
// Gives back: the form. On success the server sends the person to the pay
// page; on a problem the form shows it and keeps what they typed.
export function BookingDetailsForm({
  session,
  profile,
  editProfileHref,
  matRental,
  changeClassHref,
  classPrice,
  matPrice,
  drinkOptions,
  holdMinutes,
  lateWarning,
  noCreditHours,
  whatToBring,
  kept,
}: BookingDetailsFormProps) {
  // state = what holdSeat() last answered; formAction = send the form to it;
  // pending = true while the server is working (disables the button)
  const [state, formAction, pending] = useActionState(holdSeat, emptyHoldSeatState);
  // What to fill the form with: what was typed before an error (React
  // empties the form after each send, then refills it from these), or else
  // the kept choices from a released hold, or else nothing
  const values: Partial<Record<string, string>> =
    state.values ?? (kept ? { drink_choice: kept.drinkChoice, health_notes: kept.healthNotes } : {});

  // The voucher box. A kept voucher that still works starts applied; one
  // that doesn't starts with the reason shown.
  const keptVoucher = kept?.voucher ?? null;
  const [codeInput, setCodeInput] = useState(keptVoucher?.ok ? keptVoucher.code : "");
  const [applied, setApplied] = useState<AppliedVoucher | null>(
    keptVoucher?.ok ? { code: keptVoucher.code, label: keptVoucher.label, discount: keptVoucher.discount } : null,
  );
  const [voucherError, setVoucherError] = useState<string | null>(
    keptVoucher && !keptVoucher.ok ? `The code from your earlier hold can't be used now: ${keptVoucher.error}` : null,
  );
  const [checkingCode, startCheckingCode] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  const formRef = useRef<HTMLFormElement>(null);
  // Has the kept draft been put back yet? (Only once, when the page opens.)
  const restoredRef = useRef(false);

  // The live price preview (the database works out the real one)
  const matFee = matRental ? matPrice : 0;
  const discount = applied ? Math.min(applied.discount, classPrice) : 0;
  const total = classPrice + matFee - discount;
  const discountLabel = applied ? `${applied.code} (${applied.label})` : undefined;

  // The profile must have a name and a mobile number before booking
  const profileMissing = !profile.fullName || !profile.mobile;

  // After the server answers with a problem, move to it: the first field
  // with an error, or else the message box. (Important on phones, where the
  // Confirm button is in the bar at the bottom, far from the problem.)
  useEffect(() => {
    if (!state.error && !state.fieldErrors) return;
    const form = formRef.current;
    const target =
      form?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      form?.querySelector<HTMLElement>("[data-form-error]");
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  }, [state]);

  // When the page opens: put back what was typed before going back to step 1
  // (drink, notes, voucher code), unless the form already has better values
  // (a released hold's choices). Runs once.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (kept) return;
    const draft = readDraft();
    const form = formRef.current;
    if (!draft || !form) return;

    // The drink: tick the radio button with that name, if it's still an option
    if (draft.drink_choice) {
      const radio = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="drink_choice"]')).find(
        (input) => input.value === draft.drink_choice,
      );
      if (radio) radio.checked = true;
    }
    // The notes
    const notes = form.elements.namedItem("health_notes");
    if (draft.health_notes && notes instanceof HTMLTextAreaElement && !notes.value) {
      notes.value = draft.health_notes;
    }
    // The voucher code: checked again, as if Apply was pressed
    if (draft.voucher_code) checkCode(draft.voucher_code);
  }, [kept]);

  // Saves what's typed so far in this tab (on every change in the form).
  // Takes: nothing (reads the form). Gives back: nothing.
  function saveDraft() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    writeDraft({
      drink_choice: String(data.get("drink_choice") ?? ""),
      health_notes: String(data.get("health_notes") ?? ""),
      voucher_code: String(data.get("voucher_code") ?? ""),
    });
  }

  // Checks a voucher code and shows the discount or the reason it can't be used.
  // Takes: the code. Gives back: nothing.
  function checkCode(code: string) {
    setVoucherError(null);
    setCodeInput(code);
    startCheckingCode(async () => {
      const result = await previewVoucher(code);
      if (result.ok) {
        setApplied({ code: result.code, label: result.label, discount: result.discount });
        setCodeInput(result.code); // show it the way it's saved (capitals)
      } else {
        setApplied(null);
        setVoucherError(result.error);
      }
    });
  }

  // The "Apply" button: checks the typed code.
  function applyCode() {
    checkCode(codeInput);
  }

  // Takes the voucher off again ("Remove").
  function removeCode() {
    setApplied(null);
    setCodeInput("");
    setVoucherError(null);
    codeRef.current?.focus();
  }

  // Enter in the voucher box means "Apply", not "Confirm the booking".
  function onCodeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!applied && codeInput.trim()) applyCode();
    }
  }

  // Runs just before the form is sent.
  // A code that was typed but never checked would surprise people (it might
  // not work), so ask them to Apply it, or clear it, first. Otherwise the
  // kept draft is no longer needed (after an error, the server's answer
  // fills the form back in).
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (codeInput.trim() && !applied) {
      event.preventDefault(); // stops the form being sent
      setVoucherError("Tap Apply to check your code first, or clear the box.");
      codeRef.current?.focus();
      return;
    }
    writeDraft(null);
  }

  // Error text for one field, from the server's last answer
  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} onChange={saveDraft} noValidate>
      {/* Which class and mat: sent with the form (book_seat checks it again) */}
      <input type="hidden" name="session_id" value={session.id} />
      <input type="hidden" name="mat_rental" value={matRental ? "yes" : "no"} />

      <BookingColumns>
        <div className="flex min-w-0 flex-col gap-6">
          {/* ===== The class (and mat) you picked on step 1 ===== */}
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">
                {session.dateLabel} · {session.timeLabel}
              </p>
              <p className="text-xs text-muted">
                Mindful Mat Pilates · Beginner ·{" "}
                {matRental ? `Renting a mat (+${formatPeso(matPrice)}, to the strays)` : "Bringing my own mat"}
              </p>
            </div>
            <Badge variant={session.badgeVariant}>{session.badgeLabel}</Badge>
            <Link
              href={changeClassHref}
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-brown underline-offset-4 hover:underline"
            >
              Change<span className="sr-only"> class or mat</span>
            </Link>
          </Card>

          {/* Back from "Change details": say what happened to the old seat */}
          {kept && !state.error && !state.fieldErrors && (
            <FormMessage tone="info">
              Your earlier seat was let go, so you can change your details. Your choices are filled
              in below. Tick the Registration Agreement again, then confirm to hold a new seat.
            </FormMessage>
          )}

          {/* Less than 12 hours to go: warn BEFORE they book (CLAUDE.md section 5) */}
          {lateWarning && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-[13px] leading-relaxed text-warning">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>
                This class starts in less than {noCreditHours} hours. If you book and then cancel,
                you won&apos;t get any credit back.
              </p>
            </div>
          )}

          {/* A problem with the whole booking (e.g. "Sorry, this class is full.") */}
          {state.error && (
            <div data-form-error tabIndex={-1} className="flex flex-col gap-3 outline-none">
              <FormMessage tone="error">{state.error}</FormMessage>
              {state.pickAnother && (
                <ButtonLink href="/book" variant="secondary" className="self-start max-sm:w-full">
                  Pick another class
                </ButtonLink>
              )}
            </div>
          )}

          {/* ===== About you (from the profile, not edited here) ===== */}
          <section aria-labelledby="about-you" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4">
              <Overline as="h2" id="about-you">
                About you
              </Overline>
              <Link
                href={editProfileHref}
                className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-brown underline-offset-4 hover:underline"
              >
                <Pencil aria-hidden="true" className="size-3.5" />
                Edit in My Profile
              </Link>
            </div>
            {profileMissing && (
              <FormMessage tone="error">
                Please add your full name and mobile number in My Profile before booking, so the
                cafe can reach you.
              </FormMessage>
            )}
            <dl className="grid gap-x-4 gap-y-3 rounded-[20px] border border-line bg-card p-4 sm:grid-cols-2">
              <ShownDetail label="Full name" value={profile.fullName} />
              <ShownDetail label="Mobile number" value={profile.mobile} />
              <ShownDetail label="Email" value={profile.email} />
              <ShownDetail label="Instagram" value={profile.instagram} optional />
            </dl>
          </section>

          {/* ===== Health ===== */}
          <section aria-labelledby="health" className="flex flex-col gap-4">
            <Overline as="h2" id="health">
              Health
            </Overline>
            <Textarea
              label="Injuries or medical notes"
              name="health_notes"
              maxLength={1000}
              placeholder="For example: old knee injury, lower back pain, recent surgery."
              hint="Only the instructor sees this, so they can adjust the moves for you."
              defaultValue={values.health_notes}
              error={fieldError("health_notes")}
            />
          </section>

          {/* ===== Drink ===== */}
          {drinkOptions.length > 0 && (
            <section aria-labelledby="extras" className="flex flex-col gap-5">
              <Overline as="h2" id="extras">
                Your drink
              </Overline>
              <RadioGroup
                legend="Your free upsized drink"
                name="drink_choice"
                error={fieldError("drink_choice")}
                className="flex flex-col gap-2 sm:grid sm:grid-cols-2"
              >
                {drinkOptions.map((drink) => (
                  <RadioOption
                    key={drink}
                    name="drink_choice"
                    value={drink}
                    label={drink}
                    defaultChecked={values.drink_choice === drink}
                  />
                ))}
              </RadioGroup>
            </section>
          )}

          {whatToBring}

          {/* ===== Voucher ===== */}
          <section aria-labelledby="voucher-heading" className="flex flex-col gap-2">
            <h2 id="voucher-heading" className="font-sans text-xs font-semibold text-brown">
              Voucher or promo code <span className="font-normal text-muted">(optional)</span>
            </h2>
            <div className="flex gap-2">
              <label htmlFor="voucher_code" className="sr-only">
                Voucher or promo code
              </label>
              <input
                ref={codeRef}
                id="voucher_code"
                name="voucher_code"
                value={codeInput}
                onChange={(event) => {
                  setCodeInput(event.target.value);
                  setVoucherError(null);
                }}
                onKeyDown={onCodeKeyDown}
                // Once applied, the code is locked; "Remove" unlocks it
                readOnly={applied !== null}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                placeholder="e.g. WELCOME10"
                aria-invalid={voucherError ? true : undefined}
                aria-describedby="voucher-help"
                className={cn(
                  "block min-h-11 w-full min-w-0 flex-1 rounded-xl border bg-white px-3.5 py-3 text-base uppercase text-ink sm:text-sm",
                  "placeholder:normal-case placeholder:text-muted/70",
                  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 read-only:bg-card",
                  voucherError ? "border-error" : "border-line",
                )}
              />
              {applied ? (
                <Button variant="secondary" onClick={removeCode} className="shrink-0">
                  <X aria-hidden="true" className="size-4" />
                  Remove
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={applyCode}
                  disabled={checkingCode || !codeInput.trim()}
                  className="shrink-0"
                >
                  {checkingCode ? "Checking…" : "Apply"}
                </Button>
              )}
            </div>
            {/* The result of Apply. aria-live: screen readers read it out when it changes. */}
            <div id="voucher-help" aria-live="polite" className="text-xs">
              {voucherError && <p className="text-error">{voucherError}</p>}
              {applied && (
                <p className="flex items-center gap-1.5 font-semibold text-success">
                  <Tag aria-hidden="true" className="size-3.5" />
                  {applied.code} applied: {applied.label}, −{formatPeso(discount)}
                </p>
              )}
              {!voucherError && !applied && (
                <p className="text-muted">Codes take money off the class fee only, not the mat rental.</p>
              )}
            </div>
          </section>

          {/* ===== Price summary (phones; laptops show it in the side card) ===== */}
          <Card className="flex flex-col gap-2 lg:hidden">
            <Overline as="h2">Price</Overline>
            <PriceSummary
              classFee={classPrice}
              matFee={matFee}
              discount={discount}
              discountLabel={discountLabel}
              total={total}
            />
          </Card>

          {/* ===== The required tick: the Registration Agreement =====
              (Change 17: the "I am not pregnant" tick was removed) */}
          <Card className="flex flex-col gap-1">
            <Checkbox
              name="agreed"
              label={
                <>
                  I have read and agree to the{" "}
                  <PolicyLink href="/policies#agreement">Registration Agreement</PolicyLink> and the{" "}
                  <PolicyLink href="/policies#cancellation">cancellation policy</PolicyLink>.
                </>
              }
              defaultChecked={values.agreed === "on"}
              error={fieldError("agreed")}
            />
          </Card>

          <p className="pb-2 text-xs leading-relaxed text-muted lg:hidden">
            When you confirm, we hold your seat for {holdMinutes} minutes while you pay.
          </p>
        </div>

        {/* Sticky bar (phone) / summary card (laptop) */}
        <BookingAside
          total={formatPeso(total)}
          details={
            <div className="flex flex-col gap-3">
              <Overline as="h2">Summary</Overline>
              <p className="text-sm font-semibold text-ink">
                {session.dateLabel}
                <br />
                <span className="font-normal text-muted">{session.timeLabel}</span>
              </p>
              {/* The total is shown right under this list, so it's left out here */}
              <PriceSummary
                classFee={classPrice}
                matFee={matFee}
                discount={discount}
                discountLabel={discountLabel}
                total={total}
                showTotal={false}
              />
            </div>
          }
          action={
            <Button type="submit" fullWidth disabled={pending || profileMissing}>
              {pending ? "Holding your seat…" : "Confirm and hold seat"}
            </Button>
          }
          note={`When you confirm, we hold your seat for ${holdMinutes} minutes while you pay.`}
        />
      </BookingColumns>
    </form>
  );
}

// One detail from the profile, shown as text (not a box to type in).
// Takes: the label, the value, and optional = shows "(optional)" and
// "Not added" when empty.
// Gives back: a <div> with a <dt> and <dd> (inside the details <dl>).
function ShownDetail({ label, value, optional = false }: { label: string; value: string; optional?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-brown">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </dt>
      <dd className="break-all text-sm text-ink">
        {value || <span className="text-muted">{optional ? "Not added" : "Missing"}</span>}
      </dd>
    </div>
  );
}

// A link to the Policies page that opens in a new tab, so the form (and
// everything typed in it) stays open in this one.
// Takes: the address and the link text.
// Gives back: the link (screen readers also hear "opens in a new tab").
function PolicyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="font-semibold text-brown underline underline-offset-2"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

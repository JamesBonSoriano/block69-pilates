"use client";
// The booking step 2 form: your details, health questions, drink, mat,
// voucher code, the two required ticks, and a live price summary.
// After "Change details" on the pay page it starts with the earlier choices.
// Where it's used: src/app/(client)/book/details/page.tsx.
//
// "use client" = it runs in the browser too, so the total changes straight
// away when a mat is picked or a voucher is applied. The real work happens
// on the server: previewVoucher() and holdSeat() in src/lib/booking/actions.ts.
// The total shown here is only a preview. book_seat() in the database works
// out the real one from the settings table.
//
// Double clicks: the Confirm button is disabled while the server is working,
// and even if two clicks got through, book_seat() refuses a second seat in
// the same class and holdSeat() then simply opens the first hold's pay page.

import { Tag, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, type ReactNode, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { BookingAside, BookingColumns } from "@/components/booking/BookingLayout";
import { PriceSummary } from "@/components/booking/PriceSummary";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { Overline } from "@/components/ui/Overline";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { Textarea } from "@/components/ui/Textarea";
import { holdSeat, previewVoucher } from "@/lib/booking/actions";
import { emptyHoldSeatState, type VoucherPreview } from "@/lib/booking/form-state";
import { cn } from "@/lib/cn";
import { formatPeso } from "@/lib/format";

type BookingDetailsFormProps = {
  // The class being booked (already formatted by the page)
  session: {
    id: string;
    dateLabel: string; // "Thursday, 23 October"
    timeLabel: string; // "9:00 – 9:50 AM"
    badgeLabel: string; // "3 of 4 left"
    badgeVariant: BadgeVariant;
  };
  // What we already know about the person (from their profile)
  profile: { fullName: string; mobile: string; email: string; instagram: string };
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
// The two required ticks are NOT kept on purpose: the not-pregnant check and
// the agreement are confirmed again for every new hold.
export type KeptChoices = {
  drinkChoice: string; // "" if none
  matRental: boolean;
  firstTime: boolean;
  healthNotes: string; // "" if none
  // The old hold's voucher, checked again just now: ok (still works, so it's
  // applied straight away) or not ok (with the reason), or null if none
  voucher: VoucherPreview | null;
};

// A voucher code that passed the "Apply" check.
type AppliedVoucher = { code: string; label: string; discount: number };

// The step 2 form.
// Takes: the props above.
// Gives back: the form. On success the server sends the person to the pay
// page; on a problem the form shows it and keeps what they typed.
export function BookingDetailsForm({
  session,
  profile,
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
    state.values ??
    (kept
      ? {
          drink_choice: kept.drinkChoice,
          first_time: kept.firstTime ? "yes" : "no",
          health_notes: kept.healthNotes,
        }
      : {});

  // The mat choice is "controlled" (kept in React) because the total uses it
  const [mat, setMat] = useState<"yes" | "no">(kept?.matRental ? "yes" : "no");

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

  // The live price preview (the database works out the real one)
  const matFee = mat === "yes" ? matPrice : 0;
  const discount = applied ? Math.min(applied.discount, classPrice) : 0;
  const total = classPrice + matFee - discount;
  const discountLabel = applied ? `${applied.code} (${applied.label})` : undefined;

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

  // Checks the typed voucher code ("Apply").
  // Takes: nothing (reads the box). Gives back: nothing; shows the discount
  // or the reason it can't be used.
  function applyCode() {
    setVoucherError(null);
    startCheckingCode(async () => {
      const result = await previewVoucher(codeInput);
      if (result.ok) {
        setApplied({ code: result.code, label: result.label, discount: result.discount });
        setCodeInput(result.code); // show it the way it's saved (capitals)
      } else {
        setApplied(null);
        setVoucherError(result.error);
      }
    });
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
  // not work), so ask them to Apply it, or clear it, first.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (codeInput.trim() && !applied) {
      event.preventDefault(); // stops the form being sent
      setVoucherError("Tap Apply to check your code first, or clear the box.");
      codeRef.current?.focus();
    }
  }

  // Error text for one field, from the server's last answer
  const fieldError = (name: string) => state.fieldErrors?.[name];

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate>
      {/* Which class: sent with the form (book_seat checks it again) */}
      <input type="hidden" name="session_id" value={session.id} />

      <BookingColumns>
        <div className="flex min-w-0 flex-col gap-6">
          {/* ===== The class you picked ===== */}
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">
                {session.dateLabel} · {session.timeLabel}
              </p>
              <p className="text-xs text-muted">Mindful Mat Pilates · Beginner</p>
            </div>
            <Badge variant={session.badgeVariant}>{session.badgeLabel}</Badge>
            <Link
              href={`/book?session=${session.id}`}
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-brown underline-offset-4 hover:underline"
            >
              Change<span className="sr-only"> class</span>
            </Link>
          </Card>

          {/* Back from "Change details": say what happened to the old seat */}
          {kept && !state.error && !state.fieldErrors && (
            <FormMessage tone="info">
              Your earlier seat was let go, so you can change your details. Your choices are filled
              in below. Tick the two boxes again, then confirm to hold a new seat.
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

          {/* ===== About you ===== */}
          <section aria-labelledby="about-you" className="flex flex-col gap-4">
            <Overline as="h2" id="about-you">
              About you
            </Overline>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                name="full_name"
                autoComplete="name"
                required
                maxLength={120}
                defaultValue={values.full_name ?? profile.fullName}
                error={fieldError("full_name")}
              />
              <Input
                label="Mobile number"
                name="mobile"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                placeholder="0917 123 4567"
                defaultValue={values.mobile ?? profile.mobile}
                error={fieldError("mobile")}
              />
              <Input
                label="Email"
                name="email_display"
                type="email"
                // Only shown: the login email is changed in My Account, not here
                readOnly
                aria-readonly="true"
                required
                value={profile.email}
                hint="Your login email. Change it in My Account."
              />
              <Input
                label="Instagram"
                name="instagram"
                autoComplete="off"
                placeholder="@yourname"
                maxLength={31}
                defaultValue={values.instagram ?? profile.instagram}
                error={fieldError("instagram")}
              />
            </div>
            <p className="text-xs text-muted">
              We save your name, mobile and Instagram to your profile for next time.
            </p>
          </section>

          {/* ===== Health ===== */}
          <section aria-labelledby="health" className="flex flex-col gap-4">
            <Overline as="h2" id="health">
              Health
            </Overline>
            <RadioGroup
              legend="Is this your first Pilates class?"
              name="first_time"
              error={fieldError("first_time")}
              className="grid grid-cols-2 gap-2"
            >
              <RadioOption name="first_time" value="yes" label="Yes" defaultChecked={values.first_time === "yes"} />
              <RadioOption name="first_time" value="no" label="No" defaultChecked={values.first_time === "no"} />
            </RadioGroup>
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

          {/* ===== Drink and mat ===== */}
          <section aria-labelledby="extras" className="flex flex-col gap-5">
            <Overline as="h2" id="extras">
              Your drink and mat
            </Overline>
            {drinkOptions.length > 0 && (
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
            )}
            <RadioGroup legend="Mat" name="mat_rental" error={fieldError("mat_rental")}>
              <RadioOption
                name="mat_rental"
                value="yes"
                label="Rent a mat"
                aside={`+${formatPeso(matPrice)} to the strays`}
                description="All of the rental is donated to feed stray animals."
                checked={mat === "yes"}
                onChange={() => setMat("yes")}
              />
              <RadioOption
                name="mat_rental"
                value="no"
                label="I'll bring my own mat"
                checked={mat === "no"}
                onChange={() => setMat("no")}
              />
            </RadioGroup>
          </section>

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
                  "focus:border-brown focus:outline-none focus:ring-2 focus:ring-brown/20 read-only:bg-card",
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

          {/* ===== The two required ticks ===== */}
          <Card className="flex flex-col gap-1">
            <Checkbox
              name="not_pregnant"
              label="I am not pregnant. (This class is not suitable during pregnancy.)"
              defaultChecked={values.not_pregnant === "on"}
              error={fieldError("not_pregnant")}
            />
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
              <PriceSummary classFee={classPrice} matFee={matFee} discount={discount} discountLabel={discountLabel} total={total} />
            </div>
          }
          action={
            <Button type="submit" fullWidth disabled={pending}>
              {pending ? "Holding your seat…" : "Confirm and hold seat"}
            </Button>
          }
          note={`When you confirm, we hold your seat for ${holdMinutes} minutes while you pay.`}
        />
      </BookingColumns>
    </form>
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

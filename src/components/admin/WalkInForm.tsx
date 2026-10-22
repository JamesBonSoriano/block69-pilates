"use client";
// The Walk-in booking form: for guests who book at the counter or by message.
// Where it's used: src/app/admin/walk-in/page.tsx.
// Layout follows docs/designs/AdminWalkIn.html: numbered cards (1. Class,
// 2. Guest, 3. Drink and mat, 4. Confirmed in person) and a "Payment
// received" card with the total and the button (on the right on laptops,
// at the end on phones).
//
// Sending the form runs addWalkIn() (src/lib/admin/actions.ts), which calls
// admin_walkin_booking(): the same locked seat check as online booking, prices
// from settings, saved as confirmed with a paid payment. The total shown here
// is only a preview; the database works out the real one.
//
// "use client" = the total changes when "Rent a mat" is picked, and the
// form shows "Saving…", errors and the result.

import { CircleCheck, ListChecks } from "lucide-react";
import { useActionState, useState } from "react";
import { addWalkIn } from "@/lib/admin/actions";
import { emptyWalkInState } from "@/lib/admin/form-state";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormMessage } from "@/components/ui/FormMessage";
import { Input } from "@/components/ui/Input";
import { RadioGroup, RadioOption } from "@/components/ui/RadioGroup";
import { Textarea } from "@/components/ui/Textarea";
import { formatPeso } from "@/lib/format";
import { AdminCard } from "./AdminUi";

// One class the admin can pick.
export type WalkInClassOption = {
  sessionId: string;
  timeLabel: string; // e.g. "9:00 – 9:50 AM"
  seatsLabel: string; // e.g. "2 of 4 seats left" or "Full"
  disabled: boolean; // full: shown greyed out, can't be picked
};

// The classes of one day.
export type WalkInDay = { dateLabel: string; classes: WalkInClassOption[] };

type WalkInFormProps = {
  days: WalkInDay[]; // classes that haven't ended yet, by day
  defaultSessionId: string | null; // picked when the page opens
  drinkOptions: string[]; // from settings
  classPrice: number; // from settings (preview only)
  matPrice: number; // from settings (preview only)
};

// The walk-in form.
// Takes: the props above.
// Gives back: the "Booked" box after a booking, and the form.
export function WalkInForm({ days, defaultSessionId, drinkOptions, classPrice, matPrice }: WalkInFormProps) {
  const [state, formAction, pending] = useActionState(addWalkIn, emptyWalkInState);
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  // "yes" / "no": only used to show the right total
  const [mat, setMat] = useState(values.mat ?? "no");
  const total = classPrice + (mat === "yes" ? matPrice : 0);
  const pickedSession = values.session_id ?? defaultSessionId ?? "";

  return (
    <div className="flex flex-col gap-5">
      {/* ---- The result of the last walk-in ---- */}
      {state.done && (
        <AdminCard className="flex flex-col gap-3 border-success/40 bg-success-bg/40" role="status">
          <div className="flex items-start gap-3">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-success" />
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">{state.done.guestName} is booked</h2>
              <p className="text-sm">
                {state.done.classLabel} · {formatPeso(state.done.total)} paid with {state.done.paidWith.toLowerCase()}.
              </p>
              <p className="text-sm font-semibold text-brown">
                {state.done.seatsLeft === 0
                  ? "That class is now full."
                  : `${state.done.seatsLeft} seat${state.done.seatsLeft === 1 ? "" : "s"} left in that class.`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/admin/attendance?session=${state.done.sessionId}`} variant="secondary">
              <ListChecks aria-hidden="true" className="size-4" />
              Open attendance list
            </ButtonLink>
            <ButtonLink href={`/admin/bookings/${state.done.bookingId}`} variant="secondary">
              See the booking
            </ButtonLink>
          </div>
          <p className="text-xs text-muted">The form below is empty again for the next guest.</p>
        </AdminCard>
      )}

      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}

      {/* key: a new booking makes a brand-new (empty) form for the next guest */}
      <form
        key={state.done?.bookingId ?? "form"}
        action={formAction}
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
      >
        <div className="flex flex-col gap-5">
          {/* ---- 1. Class ---- */}
          <AdminCard className="flex flex-col gap-4">
            <h2 className="text-[15px] font-semibold">1. Class</h2>
            {days.length === 0 ? (
              <p className="text-sm text-muted">There are no open classes in the next two weeks.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {days.map((day) => (
                  <RadioGroup
                    key={day.dateLabel}
                    legend={day.dateLabel}
                    name="session_id"
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {day.classes.map((option) => (
                      <RadioOption
                        key={option.sessionId}
                        name="session_id"
                        value={option.sessionId}
                        label={option.timeLabel}
                        aside={option.seatsLabel}
                        disabled={option.disabled}
                        defaultChecked={option.sessionId === pickedSession}
                        required
                      />
                    ))}
                  </RadioGroup>
                ))}
              </div>
            )}
            {errors.session_id && <p className="text-xs text-error">{errors.session_id}</p>}
            <p className="text-xs text-muted">
              Walk-ins can be added after the online cutoff, as long as a seat is free and the class hasn&apos;t ended.
            </p>
          </AdminCard>

          {/* ---- 2. Guest ---- */}
          <AdminCard className="flex flex-col gap-4">
            <h2 className="text-[15px] font-semibold">2. Guest</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                name="full_name"
                required
                maxLength={120}
                autoComplete="off"
                defaultValue={values.full_name}
                error={errors.full_name}
              />
              <Input
                label="Mobile number"
                name="mobile"
                type="tel"
                inputMode="tel"
                required
                autoComplete="off"
                placeholder="0917 123 4567"
                defaultValue={values.mobile}
                error={errors.mobile}
              />
            </div>
            <p className="text-xs text-muted">No account is needed. The guest is saved by name and number only.</p>
          </AdminCard>

          {/* ---- 3. Drink and mat ---- */}
          <AdminCard className="flex flex-col gap-4">
            <h2 className="text-[15px] font-semibold">3. Drink and mat</h2>
            {/* The same choices as online booking (settings drink_options,
                which already has "Decide at the cafe"). If the list is ever
                empty, the drink is simply left empty. */}
            {drinkOptions.length > 0 && (
              <RadioGroup legend="Included drink (upsized)" name="drink" className="grid gap-2 sm:grid-cols-2">
                {drinkOptions.map((drink) => (
                  <RadioOption
                    key={drink}
                    name="drink"
                    value={drink}
                    label={drink}
                    defaultChecked={values.drink === drink}
                    required
                  />
                ))}
              </RadioGroup>
            )}
            <RadioGroup legend="Mat rental" name="mat" error={errors.mat} className="grid gap-2 sm:grid-cols-2">
              <RadioOption
                name="mat"
                value="yes"
                label="Rent a mat"
                aside={`+${formatPeso(matPrice)} to the strays`}
                defaultChecked={mat === "yes"}
                onChange={() => setMat("yes")}
              />
              <RadioOption
                name="mat"
                value="no"
                label="Bringing own mat"
                defaultChecked={mat === "no"}
                onChange={() => setMat("no")}
              />
            </RadioGroup>
          </AdminCard>

          {/* ---- 4. Confirmed in person ---- */}
          <AdminCard className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold">4. Confirmed in person</h2>
            <Checkbox
              name="not_pregnant"
              label="The guest confirmed the health check: not pregnant, and no injury that stops floor exercise."
              defaultChecked={values.not_pregnant === "on"}
              error={errors.not_pregnant}
            />
            <Checkbox
              name="agreed"
              label="The guest was told the cancellation policy and agreed to the Registration Agreement."
              defaultChecked={values.agreed === "on"}
              error={errors.agreed}
            />
            <Checkbox name="first_time" label="This is their first Pilates class." defaultChecked={values.first_time === "on"} />
            <Textarea
              label="Injuries or medical notes"
              name="health_notes"
              rows={2}
              maxLength={1000}
              defaultValue={values.health_notes}
              error={errors.health_notes}
              className="mt-2"
            />
          </AdminCard>
        </div>

        {/* ---- Payment received (right side on laptops, stays in view) ---- */}
        <AdminCard className="flex flex-col gap-4 lg:sticky lg:top-6">
          <h2 className="text-[15px] font-semibold">Payment received</h2>
          <RadioGroup legend="How did they pay?" name="payment" error={errors.payment}>
            <RadioOption name="payment" value="cash" label="Cash at the counter" defaultChecked={(values.payment ?? "cash") === "cash"} />
            <RadioOption name="payment" value="gcash" label="GCash transfer" defaultChecked={values.payment === "gcash"} />
            <RadioOption name="payment" value="bpi" label="BPI transfer" defaultChecked={values.payment === "bpi"} />
          </RadioGroup>
          <p className="text-xs text-muted">
            Check the transfer has arrived before saving. The booking is saved as Confirmed and paid.
          </p>

          <dl className="flex flex-col gap-1.5 border-t border-admin-line pt-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Class fee (with drink)</dt>
              <dd>{formatPeso(classPrice)}</dd>
            </div>
            {mat === "yes" && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Mat rental</dt>
                <dd>{formatPeso(matPrice)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-admin-line pt-2 font-semibold">
              <dt>Total to collect</dt>
              {/* aria-live: screen readers hear the new total when the mat changes */}
              <dd aria-live="polite" className="font-heading text-lg text-brown">
                {formatPeso(total)}
              </dd>
            </div>
          </dl>

          <Button type="submit" fullWidth disabled={pending || days.length === 0}>
            {pending ? "Saving…" : "Add walk-in booking"}
          </Button>
        </AdminCard>
      </form>
    </div>
  );
}

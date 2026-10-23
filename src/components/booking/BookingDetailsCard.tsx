"use client";
// The "Booking details" card on booking step 1 (Revisions part 1, item 4,
// the picture on PDF page 3):
//   - Date and Session, filled in as soon as a class is picked
//   - What to bring (booking/what_to_bring in site_content), with the
//     "Rent a mat" tick under the mat line (price from settings)
//   - the total so far, and "Proceed to payment"
// Mat rental is chosen HERE now. The tick is sent to step 2 as ?mat=yes, so
// step 2 doesn't ask again.
// Where it's used: src/app/(client)/book/page.tsx, inside its class form.
//
// Phones: the same <aside> is the sticky bar at the bottom of the screen. It
// shows the picked class in one line, the Rent a mat tick and the button; the
// rest of the list is hidden there (the page shows "What to bring" under the
// classes instead). Laptops: a card in the right column that stays in view.
//
// "use client" = it listens to the class radio buttons in the form around
// it, so Date and Session change straight away, and the total changes when
// the mat is ticked. The total is only a preview; book_seat() in the
// database works out the real price from settings.

import { Bath, CalendarDays, Check, ChevronRight, Clock, Footprints, GlassWater, Layers, Shirt, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { STICKY_ASIDE_CLASSES } from "@/components/booking/BookingLayout";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatPeso } from "@/lib/format";

type BookingDetailsCardProps = {
  // Every class that can be picked: id -> its date and time, ready to show
  sessions: Record<string, { date: string; time: string }>;
  initialSessionId: string | null; // a class already picked (?session=...)
  initialMat: boolean; // Rent a mat already ticked (?mat=yes, after "back")
  items: string[]; // what to bring, one item per line (settings already filled in)
  classPrice: number; // pesos, from settings
  matPrice: number; // pesos, from settings
  canBook: boolean; // false = every class is full or closed (button off)
  note?: string; // laptop only: a small line under the button
};

// Which icon goes with a "what to bring" line, by its words.
// Takes: the line. Gives back: a line icon (a plain tick if nothing matches).
function iconFor(line: string): LucideIcon {
  if (/\bmats?\b/i.test(line)) return Layers;
  if (/water|bottle|drink/i.test(line)) return GlassWater;
  if (/towel/i.test(line)) return Bath;
  if (/sock|shoe/i.test(line)) return Footprints;
  if (/cloth|shirt|wear|outfit/i.test(line)) return Shirt;
  return Check;
}

// The card / sticky bar.
// Takes: the props above.
// Gives back: an <aside> that must sit INSIDE the class form (its tick and
// button are part of that form).
export function BookingDetailsCard({
  sessions,
  initialSessionId,
  initialMat,
  items,
  classPrice,
  matPrice,
  canBook,
  note,
}: BookingDetailsCardProps) {
  const asideRef = useRef<HTMLElement>(null);
  // The class picked in the form (its id), and the mat tick
  const [selected, setSelected] = useState<string | null>(initialSessionId);
  const [mat, setMat] = useState(initialMat);

  // Listen to the class radio buttons in the form around this card.
  // (They're drawn by the page on the server, so we listen on the form.)
  useEffect(() => {
    const form = asideRef.current?.closest("form");
    if (!form) return;
    const onChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === "session") setSelected(target.value);
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);

  const picked = selected ? sessions[selected] : undefined;
  const total = classPrice + (mat ? matPrice : 0);
  // The tick goes under the first line that mentions a mat (or first in the list)
  const matIndex = items.findIndex((line) => /\bmats?\b/i.test(line));

  const matTick = (
    <Checkbox
      name="mat"
      value="yes"
      checked={mat}
      onChange={(event) => setMat(event.target.checked)}
      label={
        <>
          Rent a mat <span className="text-muted">(+{formatPeso(matPrice)}, all of it feeds stray animals)</span>
        </>
      }
    />
  );

  return (
    <aside ref={asideRef} aria-label="Booking details" data-sticky-bar className={STICKY_ASIDE_CLASSES}>
      <h2 className="hidden font-heading text-xl font-semibold text-brown lg:block">Booking details</h2>

      {/* Date and Session. aria-live: screen readers hear the change when a class is picked. */}
      <dl aria-live="polite" className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] lg:flex-col lg:gap-3 lg:text-sm">
        <div className="flex items-start gap-2.5">
          <CalendarDays aria-hidden="true" className="mt-0.5 hidden size-5 shrink-0 text-brown lg:block" />
          <div>
            <dt className="font-semibold text-ink max-lg:sr-only">Date</dt>
            <dd className={picked ? "font-semibold text-ink lg:font-normal lg:text-muted" : "text-muted"}>
              {picked?.date ?? "Pick a class"}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Clock aria-hidden="true" className="mt-0.5 hidden size-5 shrink-0 text-brown lg:block" />
          <div>
            <dt className="font-semibold text-ink max-lg:sr-only">Session</dt>
            {/* Nothing picked yet: the phone line reads "Pick a class to see
                it here"; the laptop card shows a dash */}
            <dd className="text-muted">
              {picked?.time ?? (
                <>
                  <span className="lg:hidden">to see it here</span>
                  <span className="max-lg:hidden">–</span>
                </>
              )}
            </dd>
          </div>
        </div>
      </dl>

      {/* What to bring. Phones show only the Rent a mat tick here. */}
      <div className="flex flex-col lg:gap-2 lg:border-t lg:border-line lg:pt-4">
        <h3 className="hidden font-heading text-base font-semibold text-brown lg:block">What to bring:</h3>
        <ul className="flex flex-col lg:gap-1.5">
          {matIndex === -1 && <li>{matTick}</li>}
          {items.map((line, index) => {
            const Icon = iconFor(line);
            return (
              <Fragment key={`${index}-${line}`}>
                <li className="hidden items-center gap-2.5 text-sm text-ink lg:flex">
                  <Icon aria-hidden="true" className="size-4.5 shrink-0 text-brown" />
                  {line}
                </li>
                {index === matIndex && <li className="lg:pl-7">{matTick}</li>}
              </Fragment>
            );
          })}
        </ul>
      </div>

      {/* The total so far and the button */}
      <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-4 lg:border-t lg:border-line lg:pt-4">
        <div className="flex-1 lg:flex lg:items-baseline lg:justify-between">
          <p className="text-[11px] text-muted lg:text-sm lg:font-semibold lg:text-ink">Total</p>
          <p className="font-heading text-xl font-semibold text-brown lg:text-2xl">{formatPeso(total)}</p>
        </div>
        <div className="flex-1 lg:flex-none">
          <Button type="submit" fullWidth disabled={!canBook}>
            Proceed to payment
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
      {note && <p className="hidden text-xs leading-relaxed text-muted lg:block">{note}</p>}
    </aside>
  );
}

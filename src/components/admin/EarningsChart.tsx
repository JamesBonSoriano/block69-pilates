// The two earnings pictures on the admin Payments page
// (docs/designs/AdminPayments.html):
//   EarningsByWeek   one bar per week: class fees (brown) with the mat rental
//                    part (caramel, all donated to the strays) on top
//   EarningsByMethod one meter per payment method (GCash, Maya, card, ...)
// Where it's used: src/app/admin/payments/page.tsx.
//
// Plain HTML + CSS bars (no chart library, no JavaScript). So colour is never
// the only clue: there is a legend, the amount is written above every bar,
// hovering a bar shows its numbers (title), and "Show as a table" lists them.
// Colours: brown + caramel (checked to be easy to tell apart, also for
// colour-blind people).

import type { ReactNode } from "react";
import { formatPeso } from "@/lib/format";
import { AdminCard } from "./AdminUi";

// One week's money.
export type WeekEarnings = {
  label: string; // e.g. "Oct 20 – 26"
  classFees: number; // pesos (everything except mat rental)
  mats: number; // pesos of mat rental
  payments: number; // how many paid payments
};

// One payment method's money.
export type MethodEarnings = { label: string; amount: number };

// The "Earnings by week" card.
// Takes: the weeks (oldest first) and a line under the title.
// Gives back: the card with the bars, the legend and the table view.
export function EarningsByWeek({ weeks, note }: { weeks: WeekEarnings[]; note: ReactNode }) {
  // The tallest bar fills the box; the others are a share of it
  const highest = Math.max(1, ...weeks.map((week) => week.classFees + week.mats));

  return (
    <AdminCard className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold">Earnings by week</h2>
        <p className="text-xs text-muted">{note}</p>
      </div>

      {/* The bars. aria-hidden: screen readers get the table below instead. */}
      <div aria-hidden="true" className="flex h-48 items-end gap-2 border-b border-admin-line px-1 sm:gap-4">
        {weeks.map((week) => {
          const total = week.classFees + week.mats;
          return (
            <div
              key={week.label}
              title={`${week.label}: ${formatPeso(total)} (class fees ${formatPeso(week.classFees)}, mat rental ${formatPeso(week.mats)}, ${week.payments} payments)`}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-[10px] font-semibold text-ink sm:text-[11px]">
                {formatPeso(total)}
              </span>
              {/* gap-0.5 = the 2px gap between the two parts */}
              <div className="flex w-full max-w-14 flex-col gap-0.5" style={{ height: `${(total / highest) * 85}%` }}>
                {week.mats > 0 && (
                  <div className="rounded-t-[4px] bg-caramel" style={{ height: `${(week.mats / total) * 100}%`, minHeight: 3 }} />
                )}
                {week.classFees > 0 && (
                  <div className={week.mats > 0 ? "flex-1 bg-brown" : "flex-1 rounded-t-[4px] bg-brown"} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex gap-2 px-1 text-[10px] text-muted sm:gap-4 sm:text-[11px]">
        {weeks.map((week) => (
          <span key={week.label} className="min-w-0 flex-1 text-center">
            {week.label}
          </span>
        ))}
      </div>

      {/* Legend (text in ink, the colour square beside it) */}
      <div aria-hidden="true" className="flex flex-wrap gap-4 text-xs text-ink">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brown" /> Class fees
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-caramel" /> Mat rental (donated to the strays)
        </span>
      </div>

      {/* The same numbers as a table (for screen readers, and anyone who wants exact figures) */}
      <details className="text-xs">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-brown">Show as a table</summary>
        {/* Wider screens: a table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full border-collapse">
            <caption className="sr-only">Earnings by week</caption>
            <thead>
              <tr className="border-b border-admin-line text-left text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">Week</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Class fees</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Mat rental</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Total</th>
                <th scope="col" className="py-2 text-right font-semibold">Payments</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week.label} className="border-b border-admin-bg last:border-b-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{week.label}</th>
                  <td className="py-2 pr-3 text-right">{formatPeso(week.classFees)}</td>
                  <td className="py-2 pr-3 text-right">{formatPeso(week.mats)}</td>
                  <td className="py-2 pr-3 text-right font-semibold">{formatPeso(week.classFees + week.mats)}</td>
                  <td className="py-2 text-right">{week.payments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Phones: one small stacked card per week, so nothing is wider than the screen */}
        <ul className="flex flex-col divide-y divide-admin-bg sm:hidden">
          {weeks.map((week) => (
            <li key={week.label} className="flex flex-col gap-0.5 py-2">
              <span className="flex justify-between gap-3 font-semibold">
                {week.label}
                <span>{formatPeso(week.classFees + week.mats)}</span>
              </span>
              <span className="text-muted">
                Class fees {formatPeso(week.classFees)} · mat rental {formatPeso(week.mats)} · {week.payments} payment
                {week.payments === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </AdminCard>
  );
}

// The "By payment method" card.
// Takes: the methods (biggest first) and a line under the title.
// Gives back: one labelled meter per method (a real <meter>-like bar with
// the amount and share written out).
export function EarningsByMethod({ methods, note }: { methods: MethodEarnings[]; note: ReactNode }) {
  const total = methods.reduce((sum, method) => sum + method.amount, 0);

  return (
    <AdminCard className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">By payment method</h2>
        <p className="text-xs text-muted">{note}</p>
      </div>
      {total === 0 ? (
        <p className="text-sm text-muted">No paid payments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {methods.map((method) => {
            const share = Math.round((method.amount / total) * 100);
            return (
              <li key={method.label} className="flex flex-col gap-1.5">
                <span className="flex justify-between gap-2 text-[13px]">
                  <span>{method.label}</span>
                  <span className="font-semibold">
                    {formatPeso(method.amount)} · {share}%
                  </span>
                </span>
                <span aria-hidden="true" className="h-2 rounded-full bg-admin-bg">
                  <span className="block h-2 rounded-full bg-brown" style={{ width: `${Math.max(share, 2)}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted">Card numbers are never stored. Only PayMongo&apos;s reference is kept.</p>
    </AdminCard>
  );
}

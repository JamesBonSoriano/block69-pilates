// Small building blocks shared by every admin page, so they all look the same
// (docs/designs/AdminBookings.html, PhoneAdminDashboard.html):
//   AdminPage        the page's padding and spacing
//   AdminPageHeader  small label + title + one line + buttons on the right
//   AdminCard        a white card with the thin admin border
//   StatCard         a number card (Dashboard, Attendance)
//   AdminLoading     grey placeholders while live data loads
//   AdminLoadError   "couldn't load" message
// Where it's used: the pages in src/app/admin/ and src/components/admin/.

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// The padding around an admin page's content.
// Takes: the page content. Gives back: a column with even gaps.
// (Phones: 16px sides as in the mockups. Laptops: 40px.)
export function AdminPage({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 px-4 py-5 lg:gap-6 lg:px-10 lg:py-8">{children}</div>;
}

// The top of an admin page.
// Takes: a small label above the title (e.g. "Thursday, October 23"), the
// title, an optional line under it, and optional buttons (actions).
// Gives back: the heading block. The buttons sit on the right on laptops
// and under the title on phones.
export function AdminPageHeader({
  overline,
  title,
  intro,
  actions,
}: {
  overline?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {overline && <AdminOverline>{overline}</AdminOverline>}
        <h1 className="text-[22px] font-semibold leading-tight lg:text-[30px]">{title}</h1>
        {intro && <p className="text-sm text-muted">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5 print:hidden">{actions}</div>}
    </div>
  );
}

// The small capital-letter label from the admin mockups (".ov").
// The mockups color it caramel, but caramel on white is too faint for such
// small text (contrast about 3.9 : 1, the minimum is 4.5 : 1), so it's brown.
// Takes: the text, and an optional tag (a heading tag when it names a section).
// Gives back: the styled label. CSS makes it capitals, so screen readers
// read it as a normal word.
export function AdminOverline({
  as: Tag = "p",
  className,
  children,
}: {
  as?: "p" | "h2" | "h3" | "span";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cn("font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-brown", className)}>
      {children}
    </Tag>
  );
}

// A white admin card (CLAUDE.md section 7: "admin cards are white with
// border #EFE6D6").
// Takes: extra classes, children and normal <div> attributes.
// Gives back: the card. Use className="p-0" for a card holding a table.
export function AdminCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-2xl border border-admin-line bg-white p-4 lg:p-6 print:border-ink/20", className)}
      {...props}
    />
  );
}

// A card with one big number (the Dashboard and Attendance summaries).
// Takes: the label (e.g. "Today"), the number as text (e.g. "7 of 8"), a
// small line under it, and an optional tone ("alert" = red border, for
// "Needs action" when it isn't 0).
// Gives back: the card.
export function StatCard({
  label,
  value,
  note,
  tone = "normal",
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "normal" | "alert";
}) {
  return (
    <AdminCard className={cn("flex flex-col gap-1 p-3.5 lg:p-5", tone === "alert" && "border-error/40 bg-error-bg/30")}>
      <AdminOverline>{label}</AdminOverline>
      <p className="font-heading text-[22px] font-semibold leading-tight text-brown lg:text-[26px]">{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </AdminCard>
  );
}

// Grey placeholders shown while a page's live part loads.
// Takes: what is loading (for screen readers) and how many blocks to show.
// Gives back: pulsing empty white cards.
export function AdminLoading({ label, blocks = 3 }: { label: string; blocks?: number }) {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Loading {label}…</span>
      {Array.from({ length: blocks }, (_, n) => (
        <div key={n} aria-hidden="true" className="h-28 animate-pulse rounded-2xl border border-admin-line bg-white" />
      ))}
    </div>
  );
}

// The message shown when a page's data couldn't be loaded.
// Takes: what couldn't be loaded, e.g. "the bookings".
// Gives back: a white card asking to refresh.
export function AdminLoadError({ what }: { what: string }) {
  return (
    <AdminCard className="text-sm text-muted">
      We couldn&apos;t load {what} right now. Please refresh the page in a moment.
    </AdminCard>
  );
}

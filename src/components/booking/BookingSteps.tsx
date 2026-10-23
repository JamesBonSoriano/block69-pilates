// The top of every booking step: a breadcrumb (Pick a class > Your details >
// Payment), the 3-part progress bar, "STEP 2 OF 3" and the page title
// (docs/designs/PhoneBook1.html to PhoneBook3.html).
// Where it's used: /book, /book/details and /book/pay/[bookingId].
// The breadcrumb (Revisions part 1, item 5) lets people go back a step:
// on step 2, "Pick a class" is a link that keeps the class and mat they chose.

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Overline } from "@/components/ui/Overline";
import { cn } from "@/lib/cn";

// The three steps, in order.
const STEP_NAMES = ["Pick a class", "Your details", "Payment"] as const;

type BookingStepsProps = {
  step: 1 | 2 | 3; // which step this page is
  title: string; // the page's main heading, e.g. "Pick a class"
  intro?: ReactNode; // an optional short line under the title
  // A ready-made breadcrumb with links (step 2 makes one that keeps the
  // person's choices). Without it, a plain one with no links is shown.
  breadcrumb?: ReactNode;
};

// The step header.
// Takes: the step number, the title, an optional intro line and breadcrumb.
// Gives back: the breadcrumb, the progress bar (decoration only), the
// "Step X of 3" label and the <h1>. Screen readers hear "Step 2 of 3" from
// the label, so the bar itself is hidden from them.
export function BookingSteps({ step, title, intro, breadcrumb }: BookingStepsProps) {
  return (
    <div className="flex flex-col gap-3">
      {breadcrumb ?? <BookingBreadcrumb current={step} />}
      <div aria-hidden="true" className="flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("h-1 flex-1 rounded", n <= step ? "bg-primary" : "bg-line")} />
        ))}
      </div>
      <div className="mt-1 flex flex-col gap-1">
        <Overline>Step {step} of 3</Overline>
        <h1 className="text-[30px] font-normal leading-tight lg:text-4xl">{title}</h1>
        {intro && <div className="mt-1 text-sm leading-relaxed text-muted">{intro}</div>}
      </div>
    </div>
  );
}

// The breadcrumb: Pick a class > Your details > Payment.
// Takes: current = this page's step, and links = addresses for EARLIER steps
// that can be opened again (e.g. { 1: "/book?session=...&mat=yes" }).
// Gives back: a <nav> with the steps. Earlier steps with a link are links;
// the current step is bold (aria-current="step"); the rest are plain text.
export function BookingBreadcrumb({
  current,
  links = {},
}: {
  current: 1 | 2 | 3;
  links?: Partial<Record<1 | 2, string>>;
}) {
  return (
    <nav aria-label="Booking steps">
      <ol className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
        {STEP_NAMES.map((name, index) => {
          const n = (index + 1) as 1 | 2 | 3;
          // Only an EARLIER step can be a link
          const href = n < current && n !== 3 ? links[n as 1 | 2] : undefined;
          return (
            <li key={name} className="flex min-h-11 items-center gap-1.5">
              {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 text-muted" />}
              {href ? (
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center font-semibold text-brown underline underline-offset-4 hover:no-underline"
                >
                  {name}
                </Link>
              ) : (
                <span
                  aria-current={n === current ? "step" : undefined}
                  className={n === current ? "font-semibold text-ink" : "text-muted"}
                >
                  {name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

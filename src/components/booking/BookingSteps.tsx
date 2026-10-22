// The top of every booking step: the 3-part progress bar, "STEP 2 OF 3" and
// the page title (docs/designs/PhoneBook1.html to PhoneBook3.html).
// Where it's used: /book, /book/details and /book/pay/[bookingId].

import type { ReactNode } from "react";
import { Overline } from "@/components/ui/Overline";
import { cn } from "@/lib/cn";

type BookingStepsProps = {
  step: 1 | 2 | 3; // which step this page is
  title: string; // the page's main heading, e.g. "Pick a class"
  intro?: ReactNode; // an optional short line under the title
};

// The step header.
// Takes: the step number, the title and an optional intro line.
// Gives back: the progress bar (decoration only), the "Step X of 3" label and
// the <h1>. Screen readers hear "Step 2 of 3" from the label, so the bar
// itself is hidden from them.
export function BookingSteps({ step, title, intro }: BookingStepsProps) {
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden="true" className="flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("h-1 flex-1 rounded", n <= step ? "bg-brown" : "bg-line")} />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <Overline>Step {step} of 3</Overline>
        <h1 className="text-[30px] font-normal leading-tight lg:text-4xl">{title}</h1>
        {intro && <div className="mt-1 text-sm leading-relaxed text-muted">{intro}</div>}
      </div>
    </div>
  );
}

// The small, bold, capital-letter label used above titles and on cards, e.g.
// "MINDFUL MAT PILATES · THU TO SUN" or "WHAT'S INCLUDED"
// (docs/designs/PhoneHome.html, class "over").
// Where it's used: Home, About Us and Policies.

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type OverlineProps = {
  as?: "p" | "h2" | "h3"; // which tag to use (use a heading tag when it names a section)
  id?: string; // lets a section point at it as its name (aria-labelledby)
  className?: string;
  children: ReactNode;
};

// A small capital-letter label.
// Takes: the tag to use (default <p>), an optional id, extra classes and the text.
// Gives back: the styled label. The text is written normally; CSS makes it
// capitals, so screen readers don't spell it out letter by letter.
export function Overline({ as: Tag = "p", id, className, children }: OverlineProps) {
  return (
    <Tag
      id={id}
      className={cn(
        "font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-brown",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

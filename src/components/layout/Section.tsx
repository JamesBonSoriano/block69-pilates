// A page section with the site's standard width and side padding:
// full width with 20px sides on phones, centered and at most 1152px wide
// (32px sides) on laptops, the same as the Header and Footer.
// Where it's used: Home, About Us, Policies and the "page not found" page.

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// A <section> lined up with the header and footer.
// Takes: extra classes (e.g. top/bottom padding, grid) and normal <section>
// attributes (id, aria-labelledby...).
// Gives back: the <section> with the children inside.
export function Section({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("mx-auto w-full max-w-6xl px-5 lg:px-8", className)}
      {...props}
    />
  );
}

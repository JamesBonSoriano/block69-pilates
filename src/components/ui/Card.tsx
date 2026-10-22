// A shared card box (CLAUDE.md section 7): rounded corners (20px on phones,
// 24px on laptops), cream-white fill, thin tan border, no heavy shadow.
// Where it's used: client pages (info boxes, forms, messages, ...).
// (Admin pages will use white cards with the admin-line border instead.)
// It's a plain <div>: to make it a list item or a page section, put it inside
// an <li> or <section>.

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// A card container.
// Takes: extra classes (e.g. a different padding), children, and any normal
// <div> attributes.
// Gives back: the styled box with the children inside.
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-line bg-card p-5 lg:rounded-3xl lg:p-6",
        className,
      )}
      {...props}
    />
  );
}

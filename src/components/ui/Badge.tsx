// A small rounded status label (CLAUDE.md section 7, "Status badge colors").
// Where it's used: seats left on session cards, booking and payment statuses,
// voucher statuses, and the admin tables.

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// The badge colors and what they mean:
//   success    confirmed, paid, active
//   available  a class with free seats ("3 of 4 left"), Light Sage
//   info       awaiting verification
//   warning    few seats left, pending
//   error      needs action, expired, forfeited, fully booked
//   neutral    used, transferred, booking closed (beige on the client side)
export type BadgeVariant = "success" | "available" | "info" | "warning" | "error" | "neutral";

// Background + text color for each variant (from the theme tokens).
const variantClasses: Record<BadgeVariant, string> = {
  success: "bg-success-bg text-success",
  // Light Sage with the dark green status text (sage-dark text would be too
  // faint for 11px letters on this light background)
  available: "bg-sage-light text-success",
  info: "bg-info-bg text-info",
  warning: "bg-warning-bg text-warning",
  error: "bg-error-bg text-error",
  neutral: "bg-neutral-bg text-brown",
};

type BadgeProps = ComponentProps<"span"> & {
  variant?: BadgeVariant;
};

// A status badge.
// Takes: variant (default "neutral"), extra classes, and the text to show.
// Gives back: a small pill-shaped <span>.
export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

// A colored message box for the top of a form: an error, a success or a note.
// Where it's used: the login, sign-up and password forms (and later any form
// that needs to say "saved" or "something went wrong").

import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// The three kinds of message and their colors (status badge colors, CLAUDE.md §7).
type Tone = "error" | "success" | "info";

const toneClasses: Record<Tone, string> = {
  error: "bg-error-bg text-error",
  success: "bg-success-bg text-success",
  info: "bg-info-bg text-info",
};

const toneIcons = { error: CircleAlert, success: CircleCheck, info: Info };

// A message box.
// Takes: the tone and the message.
// Gives back: a rounded box with an icon. Errors use role="alert" so screen
// readers read them out straight away; the others use role="status".
export function FormMessage({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = toneIcons[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-2xl px-4 py-3.5 text-sm leading-relaxed", toneClasses[tone])}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}

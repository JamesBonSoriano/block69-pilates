"use client";
// Opens current policy text without leaving a booking form or changing its inputs.
import { createContext, useContext, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

type PolicySection = "cancellation" | "agreement";
type Policies = Partial<Record<PolicySection, { title: string; body: ReactNode }>>;
const PoliciesContext = createContext<Policies>({});

// Shares the server-rendered policy sections with their links.
export function BookingPolicies({ sections, children }: { sections: Policies; children: ReactNode }) {
  return <PoliciesContext.Provider value={sections}>{children}</PoliciesContext.Provider>;
}

// Opens a scrollable native dialog, with a direct policy link as the fallback.
export function PolicyDialogLink({ section, children, className }: {
  section: PolicySection;
  children: ReactNode;
  className?: string;
}) {
  const policy = useContext(PoliciesContext)[section];
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLAnchorElement>(null);
  const titleId = useId();
  return (
    <>
      <a
        ref={trigger}
        href={`/policies#${section}`}
        className={className ?? "font-semibold text-brown underline underline-offset-2"}
        aria-haspopup={policy ? "dialog" : undefined}
        onClick={(event) => {
          if (!dialog.current || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          // Suppress the link and any surrounding checkbox label activation.
          event.preventDefault();
          dialog.current.showModal();
        }}
      >
        {children}
      </a>
      {policy && (
        <dialog
          ref={dialog}
          aria-labelledby={titleId}
          className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl border border-line bg-cream p-5 text-ink backdrop:bg-ink/50 sm:p-6"
          onClose={() => trigger.current?.focus()}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-xl">{policy.title}</h2>
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>Close</Button>
          </div>
          {policy.body}
        </dialog>
      )}
    </>
  );
}

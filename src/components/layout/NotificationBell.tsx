"use client";
// The bell button in the client header (Change 17, Part B): the client's
// booking updates (booking confirmed, payment checked, moved, cancelled...).
// They used to be a list on My Account > Notifications; that page now only
// holds the email settings.
//   - laptop: the bell opens a dropdown panel under it
//   - phone:  the bell opens a full-screen sheet
// The red count on the bell = unread updates (it moved here from the person
// icon). Opening the bell loads the list, shows it with "New" labels, and
// THEN marks everything as read, so the count goes away.
// Where it's used: src/components/layout/HeaderAccount.tsx (laptop header and
// phone bar), for logged-in clients only (admins have no notifications).
//
// "use client" = it opens and closes in the browser, and asks the server for
// the list only when it's opened (loadMyUpdates()), so normal page visits
// only load the small unread count.

import {
  Bell,
  CircleAlert,
  CircleCheck,
  Clock,
  Settings,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { loadMyUpdates, markNotificationsRead } from "@/lib/account/actions";
import { cn } from "@/lib/cn";
import { formatManilaDateTime } from "@/lib/format";
import type { NotificationListItem } from "@/lib/notifications";

// The browser event every bell listens for: "the updates were just marked as
// read". The header has two bells (laptop and phone; only one is visible at a
// time), so when one marks them read, the other clears its count too.
const READ_EVENT = "b69:notifications-read";

// The icon and circle colors for each tone (status colors, CLAUDE.md section 7).
const TONE_STYLES: Record<BadgeVariant, { icon: LucideIcon; circle: string }> = {
  success: { icon: CircleCheck, circle: "bg-success-bg text-success" },
  available: { icon: CircleCheck, circle: "bg-sage-light text-success" },
  info: { icon: Clock, circle: "bg-info-bg text-info" },
  warning: { icon: TriangleAlert, circle: "bg-warning-bg text-warning" },
  error: { icon: CircleAlert, circle: "bg-error-bg text-error" },
  neutral: { icon: Bell, circle: "bg-tan-soft text-brown" },
};

// Where the list is up to.
type ListState =
  | { status: "idle" } // never opened yet
  | { status: "loading" }
  | { status: "ready"; updates: NotificationListItem[] }
  | { status: "error"; message: string };

// The bell.
// Takes: initialUnread = the unread count when the page was drawn, and
// size = "lg" (laptop header) or "sm" (phone bar).
// Gives back: the bell button with its count, and the panel / sheet when open.
export function NotificationBell({ initialUnread, size }: { initialUnread: number; size: "lg" | "sm" }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [list, setList] = useState<ListState>({ status: "idle" });

  const panelId = useId();
  const headingId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null); // the bell + its panel
  const buttonRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Another bell on the page marked the updates as read: clear our count too.
  useEffect(() => {
    const clear = () => setUnread(0);
    window.addEventListener(READ_EVENT, clear);
    return () => window.removeEventListener(READ_EVENT, clear);
  }, []);

  // While open: Escape closes it, a click outside closes it (laptop
  // dropdown), the page behind the phone sheet can't scroll, and the
  // keyboard focus moves to the panel's heading so screen readers start there.
  useEffect(() => {
    if (!open) return;

    headingRef.current?.focus();
    // "max-lg:" = only on phone widths (the laptop dropdown doesn't lock the page)
    document.body.classList.add("max-lg:overflow-hidden");

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus(); // back to the bell
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);

    // Clean-up when it closes
    return () => {
      document.body.classList.remove("max-lg:overflow-hidden");
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Loads the list from the server, shows it, then marks it as read.
  // Takes: nothing. Gives back: nothing (updates the state).
  async function loadList() {
    setList({ status: "loading" });
    try {
      const result = await loadMyUpdates();
      if ("error" in result) {
        setList({ status: "error", message: result.error });
        return;
      }
      // Show the list first (with its "New" labels)...
      setList({ status: "ready", updates: result.updates });
      // ...then save them as read and clear every bell's count
      if (result.updates.some((update) => update.isNew)) {
        await markNotificationsRead();
        window.dispatchEvent(new Event(READ_EVENT));
      }
    } catch {
      // The network dropped or the server was restarted
      setList({ status: "error", message: "Sorry, we couldn't load your updates. Please try again." });
    }
  }

  // Opens or closes the panel. Every opening loads the list again, so it's
  // never out of date.
  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    void loadList();
  }

  // Closes the panel (the X button, or a link inside it was tapped).
  function close() {
    setOpen(false);
  }

  // Screen readers hear "Notifications" plus how many are new
  const label = unread > 0 ? `Notifications (${unread} new)` : "Notifications";

  return (
    <div ref={wrapperRef} className="lg:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="relative flex size-11 shrink-0 items-center justify-center rounded-full text-cream hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
      >
        <Bell aria-hidden="true" className={size === "lg" ? "size-5.5" : "size-5"} />
        {/* The unread count (9+ when there are many) */}
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-primary bg-error px-1 text-[10px] font-bold leading-none text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          // Phone: a full-screen sheet (above the header). Laptop: a 24rem
          // dropdown under the bell, right edges lined up.
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-cream text-ink",
            "lg:absolute lg:inset-auto lg:right-0 lg:top-full lg:mt-2 lg:max-h-[min(36rem,calc(100dvh-7rem))] lg:w-96",
            "lg:overflow-hidden lg:rounded-3xl lg:border lg:border-line lg:shadow-xl",
          )}
        >
          {/* Title bar */}
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-line bg-card px-5 lg:min-h-14">
            <h2
              ref={headingRef}
              id={headingId}
              tabIndex={-1}
              className="font-heading text-lg font-semibold focus:outline-none"
            >
              Notifications
            </h2>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => {
                close();
                buttonRef.current?.focus();
              }}
              className="-mr-2 flex size-11 items-center justify-center rounded-full text-brown hover:bg-tan-soft focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          {/* The list (scrolls inside the panel). aria-live: screen readers
              hear when it has finished loading. */}
          <div className="flex-1 overflow-y-auto px-5" aria-live="polite" aria-busy={list.status === "loading"}>
            <PanelBody list={list} onRetry={() => void loadList()} onLinkClick={close} />
          </div>

          {/* Settings link at the bottom */}
          <div className="border-t border-line bg-card px-5 py-2">
            <Link
              href="/account/notifications"
              onClick={close}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brown underline-offset-4 hover:underline"
            >
              <Settings aria-hidden="true" className="size-4" />
              Email notification settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// What's inside the panel: loading, an error with "Try again", "no updates
// yet", or the list.
// Takes: the list state, what "Try again" does, and what a tapped link does
// (close the panel).
// Gives back: the content.
function PanelBody({
  list,
  onRetry,
  onLinkClick,
}: {
  list: ListState;
  onRetry: () => void;
  onLinkClick: () => void;
}) {
  if (list.status === "idle" || list.status === "loading") {
    return <p className="py-6 text-sm text-muted">Loading your updates…</p>;
  }
  if (list.status === "error") {
    return (
      <div className="flex flex-col items-start gap-2 py-6">
        <p className="text-sm text-error">{list.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brown underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    );
  }
  if (list.updates.length === 0) {
    return (
      <p className="py-6 text-sm text-muted">
        No updates yet. When you book, pay, move or cancel a class, it shows up here.
      </p>
    );
  }
  return (
    <ul>
      {list.updates.map((update) => (
        <UpdateRow key={update.id} update={update} onLinkClick={onLinkClick} />
      ))}
    </ul>
  );
}

// One update in the list.
// Takes: the update, and what a tapped link does.
// Gives back: an <li> with a colored icon, the title (and "New" if unread),
// the sentence, when it happened, and a link to the right page.
function UpdateRow({ update, onLinkClick }: { update: NotificationListItem; onLinkClick: () => void }) {
  const { icon: Icon, circle } = TONE_STYLES[update.tone];

  return (
    <li className="flex items-start gap-3 border-b border-line py-4 last:border-b-0">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", circle)}>
        <Icon aria-hidden="true" className="size-4.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {update.title}
          {update.isNew && <Badge variant="warning">New</Badge>}
        </p>
        <p className="text-sm leading-relaxed text-muted">{update.body}</p>
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <time dateTime={update.createdAt}>{formatManilaDateTime(update.createdAt)}</time>
          <Link
            href={update.href}
            onClick={onLinkClick}
            className="inline-flex min-h-11 items-center font-semibold text-brown underline-offset-4 hover:underline"
          >
            {update.linkLabel}
          </Link>
        </p>
      </div>
    </li>
  );
}

"use client";
// Marks the client's notifications as read once the Notifications page has
// been shown, and hides the unread dot on the header's person icon.
// Where it's used: src/app/(client)/account/notifications/page.tsx.
//
// "use client" = it runs in the browser after the page appears. That way the
// list first shows which updates are "New", and only THEN are they saved as
// read (on the server, by markNotificationsRead()).

import { useEffect } from "react";
import { markNotificationsRead } from "@/lib/account/actions";

// The invisible helper.
// Takes: hasUnread = are any updates on the page still unread?
// Gives back: nothing visible. If there are unread updates, it marks them as
// read once, and hides the dots (marked data-unread-dot in HeaderAccount.tsx)
// so the header matches straight away. (Hidden, not removed: React drew
// them, so React should be the one to take them away on the next page.)
export function MarkNotificationsRead({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (!hasUnread) return;
    void markNotificationsRead().then(() => {
      document.querySelectorAll<HTMLElement>("[data-unread-dot]").forEach((dot) => {
        dot.hidden = true;
      });
    });
  }, [hasUnread]);

  return null;
}

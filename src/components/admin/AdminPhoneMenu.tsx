"use client";
// The menu button in the admin's phone top bar, and the full-screen brown
// menu it opens (all admin pages, View website, Log out).
// Where it's used: src/app/admin/layout.tsx (phones and tablets only).
//
// "use client" = the menu opens and closes when tapped. It works like the
// client header's phone menu (src/components/layout/HeaderNav.tsx).

import { Menu, X } from "lucide-react";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { AdminNav } from "./AdminNav";

// The menu button + menu.
// Takes: `footer`, the parts made on the server that go at the bottom of the
// menu (View website and Log out).
// Gives back: the button, and the menu while it's open.
export function AdminPhoneMenu({ footer }: { footer: ReactNode }) {
  const [open, setOpen] = useState(false);

  // While the menu is open: stop the page behind it from scrolling, and let
  // the Escape key close it. The clean-up undoes both when it closes.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("max-lg:overflow-hidden");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("max-lg:overflow-hidden");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // Closes the menu when any link in it is tapped (clicks bubble up to the
  // menu, so one listener catches them all).
  // Takes: the click event. Gives back: nothing.
  const closeOnLinkClick = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("a")) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        // Icon-only button, so it needs a text label for screen readers
        aria-label={open ? "Close admin menu" : "Open admin menu"}
        aria-expanded={open}
        aria-controls="admin-phone-menu"
        onClick={() => setOpen((isOpen) => !isOpen)}
        className="-mr-2.5 inline-flex size-11 items-center justify-center rounded-full text-cream hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-cream"
      >
        {open ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
      </button>

      {/* The menu, under the 64px top bar (top-16), above the bottom tabs */}
      {open && (
        <div
          id="admin-phone-menu"
          onClick={closeOnLinkClick}
          onSubmit={() => setOpen(false)}
          className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col gap-6 overflow-y-auto bg-brown px-4 pb-8 pt-4 lg:hidden"
        >
          <AdminNav variant="menu" />
          <div className="mt-auto flex flex-col gap-3 border-t border-brown-line pt-5">{footer}</div>
        </div>
      )}
    </>
  );
}

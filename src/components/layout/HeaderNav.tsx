"use client";
// The interactive part of the client Header: the desktop links, and on phones
// the menu button that opens a full-screen brown menu (docs/designs/PhoneMenu.html).
// Where it's used: src/components/layout/Header.tsx.
//
// "use client" = this runs in the browser too, because the menu has to open
// and close when tapped.
//
// It is STATIC: it doesn't know who is logged in. Header.tsx hands it the
// account parts (Log in / initials / Admin / Log out) ready-made, each in its
// own <Suspense>, and this file only decides WHERE they go.
// Step 10 adds the My Account sub-links (Profile, Payments, Vouchers,
// Notifications) to the phone menu, once those pages exist.

import { MessageCircle, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isActiveLink, mainNavLinks } from "./nav-links";

type HeaderNavProps = {
  chatUrl: string; // the "Chat With Us" link (from settings)
  desktopAccount: ReactNode; // laptop: Log in, or Admin + initials + Log out
  phoneAvatar: ReactNode; // phone bar: initials next to the menu button
  phoneMenuUser: ReactNode; // top of the phone menu: name + email
  phoneMenuActions: ReactNode; // bottom of the phone menu: Log in, or Admin + Log out
};

// The header nav.
// Takes: chatUrl and the four account parts (see above).
// Gives back: the desktop links + buttons, and the phone menu button + menu.
export function HeaderNav({
  chatUrl,
  desktopAccount,
  phoneAvatar,
  phoneMenuUser,
  phoneMenuActions,
}: HeaderNavProps) {
  // Is the phone menu open?
  const [menuOpen, setMenuOpen] = useState(false);

  // While the phone menu is open: stop the page behind it from scrolling, and
  // let the Escape key close it.
  useEffect(() => {
    if (!menuOpen) return;

    // "max-lg:" = only on phone/tablet widths, so a laptop is never stuck
    document.body.classList.add("max-lg:overflow-hidden");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);

    // Clean-up: runs when the menu closes (undo both changes)
    return () => {
      document.body.classList.remove("max-lg:overflow-hidden");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  // Closes the phone menu.
  const closeMenu = () => setMenuOpen(false);

  // Closes the phone menu when any link inside it is tapped (including the
  // Log in and Admin links made on the server, which can't be handed our
  // closeMenu function). Clicks bubble up to the menu, so one listener
  // catches them all.
  // Takes: the click event. Gives back: nothing.
  const closeMenuOnLinkClick = (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest("a")) closeMenu();
  };

  return (
    <>
      {/* ===== Laptop / desktop (1024px and wider): links in a row ===== */}
      <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
        <NavLinks variant="desktop" />
        <div className="flex items-center gap-3">
          {chatUrl && (
            <ButtonLink
              href={chatUrl}
              external
              variant="lightOutline"
              // Icon only on smaller laptops, to leave room for the account
              // buttons (the hidden text still names the link for screen readers)
              className="max-xl:px-3"
            >
              <MessageCircle aria-hidden="true" className="size-4" />
              <span className="max-xl:sr-only">Chat With Us</span>
            </ButtonLink>
          )}
          {desktopAccount}
        </div>
      </nav>

      {/* ===== Phone / tablet (under 1024px): avatar + menu button ===== */}
      <div className="-mr-2.5 flex items-center gap-1 lg:hidden">
        {phoneAvatar}
        <button
          type="button"
          // Icon-only button, so it needs a text label for screen readers
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="phone-menu"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex size-11 items-center justify-center rounded-full text-cream hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-cream"
        >
          {menuOpen ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
        </button>
      </div>

      {/* The full-screen phone menu, under the 64px header (top-16).
          It closes when a link is tapped, or when Log out is sent. */}
      {menuOpen && (
        <nav
          id="phone-menu"
          aria-label="Main"
          onClick={closeMenuOnLinkClick}
          onSubmit={closeMenu}
          className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto bg-brown px-5 pb-8 pt-3 lg:hidden"
        >
          {phoneMenuUser}
          <NavLinks variant="phone" />

          {chatUrl && (
            <div className="mt-2 border-t border-brown-line pt-3">
              <a
                href={chatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 py-2.5 text-[15px] text-tan-soft"
              >
                <MessageCircle aria-hidden="true" className="size-5" />
                Chat With Us
              </a>
            </div>
          )}

          {/* mt-auto pushes the buttons to the bottom of the menu */}
          <div className="mt-auto pt-6">{phoneMenuActions}</div>
        </nav>
      )}
    </>
  );
}

// The list of main links, with the current page highlighted.
// Takes: which look to use ("desktop" pills or big "phone" menu links).
// Gives back: the list. Highlighting needs the current address
// (usePathname), which on pages with a changing part in their address (like a
// booking id) is only known when someone visits. So ONLY this list sits in
// <Suspense>; until the address is known it shows the same links, unhighlighted.
function NavLinks({ variant }: { variant: "desktop" | "phone" }) {
  return (
    <Suspense fallback={<NavLinkList variant={variant} pathname={null} />}>
      <ActiveNavLinks variant={variant} />
    </Suspense>
  );
}

// Reads the current address, then draws the list.
// Takes: the look to use. Gives back: the list with the current page highlighted.
function ActiveNavLinks({ variant }: { variant: "desktop" | "phone" }) {
  const pathname = usePathname();
  return <NavLinkList variant={variant} pathname={pathname} />;
}

// Draws the list of main links.
// Takes: the look to use, and the current path (null = unknown, so nothing
// is highlighted).
// Gives back: a <ul> of links.
function NavLinkList({
  variant,
  pathname,
}: {
  variant: "desktop" | "phone";
  pathname: string | null;
}) {
  return (
    <ul className={variant === "desktop" ? "flex items-center gap-1" : "flex flex-col gap-1"}>
      {mainNavLinks.map((link) => {
        const active = isActiveLink(link.href, pathname);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              // aria-current tells screen readers "you are here"
              aria-current={active ? "page" : undefined}
              className={
                variant === "desktop"
                  ? cn(
                      "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream",
                      active ? "bg-tan-soft text-brown" : "text-cream hover:bg-cream/10",
                    )
                  : cn(
                      "block py-3.5 font-heading text-[26px] leading-tight text-cream",
                      // The current page gets a tan underline
                      active && "underline decoration-tan decoration-2 underline-offset-8",
                    )
              }
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

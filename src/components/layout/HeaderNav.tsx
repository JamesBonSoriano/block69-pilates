"use client";
// The interactive part of the client Header: the desktop links, and on phones
// the menu button that opens a full-screen brown menu (docs/designs/PhoneMenu.html).
// Where it's used: src/components/layout/Header.tsx.
//
// "use client" = this runs in the browser too, because the menu has to open
// and close when tapped.
//
// Step 7 (login) will add: the user's initials and name in the phone menu,
// the My Account sub-links (Profile, Payments, Vouchers, Notifications),
// and Log out instead of Log in.

import { MessageCircle, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { isActiveLink, loginHref, mainNavLinks } from "./nav-links";

type HeaderNavProps = {
  chatUrl: string; // the "Chat With Us" link (from settings)
};

// The nav, with the current page highlighted.
// Takes: chatUrl.
// Gives back: the nav. It reads the current address with usePathname(), so
// Header.tsx shows it inside <Suspense> (see the note there).
export function HeaderNav({ chatUrl }: HeaderNavProps) {
  const pathname = usePathname();
  return <HeaderNavContent chatUrl={chatUrl} pathname={pathname} />;
}

// The nav itself.
// Takes: chatUrl, and the current path (null = unknown, so nothing is highlighted;
// Header.tsx uses that while the real path loads).
// Gives back: the desktop links + buttons, and the phone menu button + menu.
export function HeaderNavContent({
  chatUrl,
  pathname,
}: HeaderNavProps & { pathname: string | null }) {
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

  // Closes the phone menu (used when a link in it is tapped).
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      {/* ===== Laptop / desktop (1024px and wider): links in a row ===== */}
      <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
        <ul className="flex items-center gap-1">
          {mainNavLinks.map((link) => {
            const active = isActiveLink(link.href, pathname);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  // aria-current tells screen readers "you are here"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream",
                    active ? "bg-tan-soft text-brown" : "text-cream hover:bg-cream/10",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3">
          {chatUrl && (
            <ButtonLink href={chatUrl} external variant="lightOutline">
              <MessageCircle aria-hidden="true" className="size-4" />
              Chat With Us
            </ButtonLink>
          )}
          <ButtonLink href={loginHref} variant="light">
            Log in
          </ButtonLink>
        </div>
      </nav>

      {/* ===== Phone / tablet (under 1024px): menu button ===== */}
      <button
        type="button"
        // Icon-only button, so it needs a text label for screen readers
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="phone-menu"
        onClick={() => setMenuOpen((open) => !open)}
        className="-mr-2.5 inline-flex size-11 items-center justify-center rounded-full text-cream hover:bg-cream/10 focus-visible:outline-2 focus-visible:outline-cream lg:hidden"
      >
        {menuOpen ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
      </button>

      {/* The full-screen phone menu, under the 64px header (top-16) */}
      {menuOpen && (
        <nav
          id="phone-menu"
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto bg-brown px-5 pb-8 pt-3 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {mainNavLinks.map((link) => {
              const active = isActiveLink(link.href, pathname);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block py-3.5 font-heading text-[26px] leading-tight text-cream",
                      // The current page gets a tan underline
                      active && "underline decoration-tan decoration-2 underline-offset-8",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {chatUrl && (
            <div className="mt-2 border-t border-brown-line pt-3">
              <a
                href={chatUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
                className="inline-flex min-h-11 items-center gap-2 py-2.5 text-[15px] text-tan-soft"
              >
                <MessageCircle aria-hidden="true" className="size-5" />
                Chat With Us
              </a>
            </div>
          )}

          {/* mt-auto pushes the button to the bottom of the menu */}
          <ButtonLink
            href={loginHref}
            onClick={closeMenu}
            variant="light"
            fullWidth
            className="mt-auto"
          >
            Log in
          </ButtonLink>
        </nav>
      )}
    </>
  );
}

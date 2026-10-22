// The list of links in the client navigation (CLAUDE.md section 4:
// Home, About Us, Book a Class, My Account, plus Log in / Log out).
// Where it's used: the Header (desktop links and phone menu), the Footer
// (quick links) and the My Account side menu, so they always show the same pages.

export type NavLink = { href: string; label: string };

// The main client pages, in the order they appear.
// (Guests can open /book to see the classes; picking one, and opening
// My Account, sends them to the login page first.)
export const mainNavLinks: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/book", label: "Book a Class" },
  { href: "/account", label: "My Account" },
];

// Smaller information pages. They're listed in the footer and in the phone
// menu, but not in the desktop header row (CLAUDE.md lists only the main
// pages there, and the row has no room to spare on smaller laptops).
export const infoNavLinks: NavLink[] = [{ href: "/policies", label: "Policies" }];

// The My Account pages (the side menu on laptops, the tabs on phones, and
// the logged-in part of the phone menu). Same order as the mockups.
export const accountNavLinks: NavLink[] = [
  { href: "/account/profile", label: "My Profile" },
  { href: "/account/bookings", label: "My Bookings" },
  { href: "/account/payments", label: "Payments" },
  { href: "/account/vouchers", label: "My Vouchers" },
  { href: "/account/notifications", label: "Notifications" },
];

// The admin area. The header adds it to the links ONLY for admins (and the
// admin pages check is_admin() on the server anyway).
export const adminNavLink: NavLink = { href: "/admin", label: "Admin" };

// The login page.
export const loginHref = "/login";

// Checks if a nav link points at the page being shown, so it can be highlighted.
// Takes: the link's href and the current path (null = not known yet).
// Gives back: true for the current page. "/" only matches the Home page
// itself; other links also match their sub-pages (e.g. /account/payments
// highlights "My Account").
export function isActiveLink(href: string, pathname: string | null): boolean {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

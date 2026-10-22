// The list of links in the client navigation (CLAUDE.md section 4:
// Home, About Us, Book a Class, My Account, plus Log in / Log out).
// Where it's used: the Header (desktop links and phone menu), the Footer
// (quick links), the My Account side menu and the admin menus
// (src/components/admin/AdminNav.tsx), so they always show the same pages.

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

// The admin side menu (src/components/admin/AdminNav.tsx), in order.
// `soon` = a placeholder page until Step 11 part 2 (Payments, Pricing, Settings).
// `tab`  = also shown in the phone's bottom tab bar (the 4 pages the counter
//          uses most; the rest are in the phone menu).
export type AdminNavLink = NavLink & { soon?: boolean; tab?: boolean; tabLabel?: string };

export const adminNavLinks: AdminNavLink[] = [
  { href: "/admin", label: "Dashboard", tab: true, tabLabel: "Home" },
  { href: "/admin/bookings", label: "Bookings", tab: true },
  { href: "/admin/walk-in", label: "Walk-in booking", tab: true, tabLabel: "Walk-in" },
  { href: "/admin/attendance", label: "Attendance", tab: true },
  { href: "/admin/payments", label: "Payments", soon: true },
  { href: "/admin/pricing", label: "Pricing & Vouchers", soon: true },
  { href: "/admin/settings", label: "Settings", soon: true },
];

// Checks if an admin menu link points at the page being shown.
// Takes: the link's href and the current path (null = not known yet).
// Gives back: true for the current page. "/admin" (Dashboard) only matches
// itself; the others also match their sub-pages (/admin/bookings/<id>
// highlights "Bookings").
export function isActiveAdminLink(href: string, pathname: string | null): boolean {
  if (pathname === null) return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

// The list of links in the client navigation (CLAUDE.md section 4:
// Home, About Us, Book a Class, My Account, plus Log in / Log out).
// Where it's used: the Header (desktop links and phone menu) and the Footer
// (quick links), so all three always show the same pages.

export type NavLink = { href: string; label: string };

// The main client pages, in the order they appear.
// (/about, /book, /account and /login are built in Steps 7 to 10, so they show
// "page not found" until then.)
export const mainNavLinks: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/book", label: "Book a Class" },
  { href: "/account", label: "My Account" },
];

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

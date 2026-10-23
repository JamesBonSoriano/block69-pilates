// My Account: /account
// Where it's used: where people land after logging in from /login?next=/account,
// and old links to /account.
// It has no page of its own: it opens My Profile (/account/profile), the same
// page the person icon in the header opens (Revisions part 1, item 6). The
// other pages are in the account menu.
// (src/proxy.ts has already sent guests to the login page before this runs.)

import { redirect } from "next/navigation";

// Sends the visitor on to My Profile.
// Takes: nothing. Gives back: nothing (it always redirects).
export default function AccountPage() {
  redirect("/account/profile");
}

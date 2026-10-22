// My Account: /account
// Where it's used: "My Account" in the header, and where people land after
// logging in from /login?next=/account.
// It has no page of its own: it opens My Bookings (/account/bookings), the
// page people need most. The other pages are in the account menu.
// (src/proxy.ts has already sent guests to the login page before this runs.)

import { redirect } from "next/navigation";

// Sends the visitor on to My Bookings.
// Takes: nothing. Gives back: nothing (it always redirects).
export default function AccountPage() {
  redirect("/account/bookings");
}

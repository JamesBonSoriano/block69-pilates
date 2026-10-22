// Reads the clock for a server page that is drawing a REAL visit.
// Where it's used: My Bookings ("in 18 hours") and My Vouchers ("54 days left").
//
// Why a helper: React's lint rule says "don't read the clock while drawing a
// component", because a component in the BROWSER can be drawn again at any
// time and show a different answer. Our account pages are Server Components
// that are drawn once per visit, and only after requireUser() (which waits
// for a real visit with io()), so Next.js never freezes the clock reading into a
// prebuilt page. Calling this, rather than Date.now() in the component,
// keeps that reason written down in one place.

import "server-only"; // never sent to the browser

// The time right now.
// Takes: nothing.
// Gives back: milliseconds since 1970 (the same as Date.now()). Call it once
// per page and pass the number down, so every card on the page agrees.
export function nowForThisVisit(): number {
  return Date.now();
}

// Turns an error from one of our database functions into a message people
// can read.
// Where it's used: the booking actions (src/lib/booking/actions.ts) and the
// My Account actions (src/lib/account/actions.ts). Server code only.

import "server-only"; // never sent to the browser

// The message shown when something unexpected goes wrong.
export const GENERIC_ERROR = "Something went wrong on our side. Please try again in a moment.";

// Turns a database error into a message we can show.
// Takes: the error Supabase gave back.
// Gives back: our OWN plain-English message from the database function (they
// all use "raise exception", which has the code P0001, or 42501 for the
// login checks), or a general message for anything unexpected (which is
// logged for us, never shown).
export function friendlyDatabaseError(error: { code?: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") {
    // Postgres's own "permission denied" (e.g. logged out) isn't friendly
    return error.message.startsWith("permission denied")
      ? "Please log in again to continue."
      : error.message;
  }
  console.error("Database error:", error.code, error.message);
  return GENERIC_ERROR;
}

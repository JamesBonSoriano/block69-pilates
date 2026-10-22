// Small checks for things people type into forms or page addresses.
// Where it's used: the sign-up action (src/lib/auth/actions.ts), the booking
// action (src/lib/booking/actions.ts), the My Account actions
// (src/lib/account/actions.ts) and the pages (to check the id in the address
// before asking the database).
// These are friendly first checks only. The database checks everything again.

// Checks that a mobile number looks real.
// Takes: what was typed, e.g. "0917 123 4567" or "+63 917 123 4567".
// Gives back: true if it only uses digits, spaces, dashes, brackets and an
// optional "+" at the start, and has 10 to 13 digits.
export function isValidMobile(mobile: string): boolean {
  if (!/^\+?[0-9\s\-()]+$/.test(mobile)) return false;
  const digits = mobile.replace(/\D/g, "").length;
  return digits >= 10 && digits <= 13;
}

// An Instagram handle: letters, numbers, dots and underscores, up to 30
// (Instagram's own rule), with or without the "@" in front.
const INSTAGRAM_PATTERN = /^@?[A-Za-z0-9._]{1,30}$/;

// Checks that an Instagram handle looks real.
// Takes: what was typed, e.g. "@juan.cruz" or "juan_cruz".
// Gives back: true if it fits Instagram's rules (see above).
export function isValidInstagram(handle: string): boolean {
  return INSTAGRAM_PATTERN.test(handle);
}

// Checks a birthday typed on My Profile.
// Takes: the date field's value, "YYYY-MM-DD" (the date picker always sends this shape).
// Gives back: true for a real date between 1900 and today.
export function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // "2026-02-31" becomes 3 March, so check the date didn't change
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  // Plain text comparison works for "YYYY-MM-DD" dates
  return value >= "1900-01-01" && date.getTime() <= Date.now();
}

// The shape of a database id (a "UUID"), e.g. 3f9a1c2d-0b4e-4c1a-9d2f-1a2b3c4d5e6f.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Checks that a value is a database id before we send it to Supabase.
// Takes: anything (usually text from the address, e.g. ?session=...).
// Gives back: true if it's a correctly shaped id. (Without this check, a
// typo in the address would make the database answer with an error instead
// of a simple "not found".)
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

// Small checks for things people type into forms or page addresses.
// Where it's used: the sign-up form and action (src/app/(auth)/signup/,
// src/lib/auth/actions.ts), the booking action (src/lib/booking/actions.ts),
// the My Account actions (src/lib/account/actions.ts) and the pages (to check
// the id in the address before asking the database).
// The SAME functions run in the browser (instant messages) and on the server
// (the real check), so the two can never disagree.
// This file must not import anything: the unit tests (tests/unit/) load it
// directly with Node.

// ---------------------------------------------------------------------------
// Mobile numbers
// ---------------------------------------------------------------------------

// Takes out the spaces and dashes people type in phone numbers.
// Takes: what was typed, e.g. "0917 123-4567".
// Gives back: just the rest, e.g. "09171234567".
export function normalizePhMobile(mobile: string): string {
  return mobile.replace(/[\s-]/g, "");
}

// The strict PH mobile rule (Change 17): exactly 11 digits, starting with 09.
// Used by sign-up, My Profile and "Finish your profile".
// Takes: what was typed (spaces and dashes are allowed and ignored).
// Gives back: true for e.g. "0917 123 4567"; false for "+63 917...", 10 or 12
// digits, or letters.
export function isValidPhMobile(mobile: string): boolean {
  return /^09\d{9}$/.test(normalizePhMobile(mobile));
}

// The message shown when a mobile number breaks the rule above.
export const PH_MOBILE_ERROR = "Please enter an 11-digit mobile number starting with 09, for example 0917 123 4567.";

// The OLD, looser check: is there a usable phone number at all?
// Still used where numbers saved before Change 17 must keep working (booking
// reads the saved profile number; admin walk-ins), so "+63 917..." passes.
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

// ---------------------------------------------------------------------------
// Birthdays
// ---------------------------------------------------------------------------

// Checks a birthday in the database's shape.
// Takes: "YYYY-MM-DD".
// Gives back: true for a real date between 1900 and today.
export function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // "2026-02-31" becomes 3 March, so check the date didn't change
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  // Plain text comparison works for "YYYY-MM-DD" dates
  return value >= "1900-01-01" && date.getTime() <= Date.now();
}

// The youngest age allowed to have an account and book (Version 1.6).
export const MIN_AGE = 18;

// Today's date in the Philippines, as "YYYY-MM-DD" (class dates, birthdays
// and the 18+ rule all use Philippine time, whatever the computer's clock zone).
// Takes: "now" in milliseconds (default: the clock right now).
// Gives back: e.g. "2026-11-15".
export function manilaToday(nowMs: number = Date.now()): string {
  // "en-CA" writes dates as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

// Checks that someone born on this date is at least 18 today (Philippine date).
// Takes: the birthday as "YYYY-MM-DD", and "now" in milliseconds.
// Gives back: true from their 18th birthday on; false before it, and for a
// birthday in the future. Someone born on 29 February turns 18 on 1 March
// in a year with no 29 February. (The database trigger check_birthday_age,
// migration 23, uses the same rule.)
export function isAtLeast18(value: string, nowMs: number = Date.now()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  // Their 18th birthday as text, e.g. "2016-03-12". Plain text comparison
  // works for "YYYY-MM-DD" dates.
  const eighteenth = `${Number(match[1]) + MIN_AGE}-${match[2]}-${match[3]}`;
  return eighteenth <= manilaToday(nowMs);
}

// The message for a birthday under 18 (or in the future).
export const AGE_ERROR = "You must be at least 18 years old to book a class.";

// The oldest age allowed (Version 1.7: 18 to 100 years old).
export const MAX_AGE = 100;

// Checks that someone born on this date is 100 or younger today (Philippine
// date), i.e. their 101st birthday hasn't come yet.
// Takes: the birthday as "YYYY-MM-DD", and "now" in milliseconds.
// Gives back: true up to the day before their 101st birthday; false from it.
// (The database trigger check_birthday_age, migration 25, uses the same rule.)
export function isAtMost100(value: string, nowMs: number = Date.now()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  // Their 101st birthday as text, e.g. "2026-11-05" for someone born
  // 1925-11-05. Born 29 Feb: in a year with no 29 Feb, "2025-02-29" sorts
  // before "2025-03-01", so they turn 101 on 1 March (same as the database).
  const hundredFirst = `${Number(match[1]) + MAX_AGE + 1}-${match[2]}-${match[3]}`;
  return hundredFirst > manilaToday(nowMs);
}

// The message for a birthday that makes someone older than 100.
export const MAX_AGE_ERROR = "Please check your birthday: the age limit is 100 years old.";

// Reads a birthday typed as MM/DD/YYYY as a real calendar date.
// Takes: what was typed, e.g. "03/12/1998".
// Gives back: "1998-03-12", or null unless it is exactly MM/DD/YYYY with a
// 4-digit year, a real calendar date (no 02/30) and from 1900. (The age
// is checked separately, so a future date still comes back here.)
function readBirthdayDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, month, day, year] = match;
  const value = `${year}-${month}-${day}`;
  const date = new Date(`${value}T00:00:00Z`);
  // "2026-02-31" becomes 3 March, so check the date didn't change
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value >= "1900-01-01" ? value : null;
}

// Says what is wrong with a typed birthday, if anything.
// Takes: what was typed (MM/DD/YYYY), and "now" in milliseconds.
// Gives back: null if it's fine; BIRTHDAY_ERROR if it isn't a real date
// typed as MM/DD/YYYY; AGE_ERROR if the person is under 18 or the date is
// in the future (Version 1.6, PDF item 5); MAX_AGE_ERROR if they are older
// than 100 (Version 1.7).
export function birthdayInputProblem(text: string, nowMs: number = Date.now()): string | null {
  const value = readBirthdayDate(text);
  if (!value) return BIRTHDAY_ERROR;
  if (!isAtLeast18(value, nowMs)) return AGE_ERROR;
  // Version 1.7: no older than 100
  if (!isAtMost100(value, nowMs)) return MAX_AGE_ERROR;
  return null;
}

// Turns a birthday typed as MM/DD/YYYY into the database's "YYYY-MM-DD"
// (Change 17: the birthday box is typed, not a date picker, because the
// picker let years like 275760 through).
// Takes: what was typed, e.g. "03/12/1998", and "now" in milliseconds.
// Gives back: "1998-03-12", or null unless it passes birthdayInputProblem():
// exactly MM/DD/YYYY with a 4-digit year, a real calendar date (no 02/30),
// from 1900, and the person is 18 to 100 today (so never in the future).
export function parseBirthdayInput(text: string, nowMs: number = Date.now()): string | null {
  return birthdayInputProblem(text, nowMs) ? null : readBirthdayDate(text);
}

// Shows a saved birthday in the MM/DD/YYYY box.
// Takes: "YYYY-MM-DD" (or "" / null).
// Gives back: "MM/DD/YYYY", or "" when there's nothing (or it's not a date).
export function formatBirthdayInput(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "";
}

// The message shown when a birthday breaks the rule above.
export const BIRTHDAY_ERROR = "Please enter a real date in the past as MM/DD/YYYY, for example 03/12/1998.";

// ---------------------------------------------------------------------------
// Email addresses
// ---------------------------------------------------------------------------

// A simple "looks like an email" check (Supabase does the real check).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Checks that an email address looks real.
// Takes: the email. Gives back: true for "name@site.com"-shaped text.
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

// The only email providers allowed for EMAIL sign-up and email changes in
// this version (Change 17). Google sign-in accepts any Google account.
export const ALLOWED_EMAIL_DOMAINS = ["gmail.com", "yahoo.com"];

// Checks that an email is from an allowed provider.
// Takes: the email. Gives back: true for "...@gmail.com" or "...@yahoo.com"
// (any capitals), false for anything else.
export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return isValidEmail(email) && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

// The message shown when an email isn't from an allowed provider.
export const EMAIL_DOMAIN_ERROR = "Please use a Gmail (@gmail.com) or Yahoo (@yahoo.com) email address.";

// ---------------------------------------------------------------------------
// The sign-up form (checked in the browser AND in the server action)
// ---------------------------------------------------------------------------

// The shortest password we accept (Supabase is set to the same, 8).
export const MIN_PASSWORD = 8;

// What the sign-up form sends.
export type SignupFields = {
  full_name: string;
  mobile: string;
  birthday: string; // as typed, MM/DD/YYYY
  email: string;
  password: string;
};

// Checks every sign-up field, so the person sees all problems at once.
// Takes: the fields as typed.
// Gives back: a message per field that has a problem ({} = all good).
export function checkSignupFields(fields: SignupFields): Partial<Record<keyof SignupFields, string>> {
  const errors: Partial<Record<keyof SignupFields, string>> = {};
  const name = fields.full_name.trim();
  if (!name) errors.full_name = "Please enter your full name.";
  else if (name.length > 120) errors.full_name = "Please use 120 characters or fewer.";
  if (!isValidPhMobile(fields.mobile)) errors.mobile = PH_MOBILE_ERROR;
  // A real MM/DD/YYYY date, and at least 18 years old (Version 1.6)
  const birthdayProblem = birthdayInputProblem(fields.birthday);
  if (birthdayProblem) errors.birthday = birthdayProblem;
  if (!isValidEmail(fields.email)) errors.email = "Please enter a valid email address.";
  else if (!isAllowedEmailDomain(fields.email)) errors.email = EMAIL_DOMAIN_ERROR;
  if (fields.password.length < MIN_PASSWORD) errors.password = `Please use at least ${MIN_PASSWORD} characters.`;
  return errors;
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

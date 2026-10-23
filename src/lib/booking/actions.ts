"use server";
// Server Actions for booking a class.
// Where it's used:
//   booking step 2 (/book/details), in
//   src/app/(client)/book/details/BookingDetailsForm.tsx:
//     - previewVoucher(): the voucher box's "Apply" button
//     - holdSeat():       the "Confirm and hold my seat" button
//   the pay page (/book/pay/[id]), in src/components/booking/ChangeDetailsButton.tsx:
//     - releaseHold():    the "Change details" button
//
// "use server" = these run ONLY on our server. The browser just sends the
// form here, so nobody can change the price or skip a check by editing the
// page. The real rules are in the database anyway: book_seat() checks the
// seat, cutoff, ticks, drink and voucher, and works out the price itself.

import { redirect } from "next/navigation";
import { STAFF_ACCOUNT_ERROR, isStaffAccount } from "@/lib/auth/client-guard";
import { voucherLabel } from "@/lib/booking-rules";
import { closeOpenCheckout } from "@/lib/booking/checkout";
import type { HoldSeatState, ReleaseHoldState, VoucherPreview } from "@/lib/booking/form-state";
import { findMySessionBooking, loadSession } from "@/lib/data/booking";
import { GENERIC_ERROR, friendlyDatabaseError } from "@/lib/database-errors";
import { getPublicSettings } from "@/lib/data/settings";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { isUuid, isValidMobile } from "@/lib/validation";

// The longest health note book_seat() accepts (it refuses longer ones).
const MAX_HEALTH_NOTES = 1000;

// ---------------------------------------------------------------------------
// VOUCHER PREVIEW ("Apply")
// ---------------------------------------------------------------------------

// Checks a voucher code and says how much it takes off, BEFORE booking.
// Takes: the code the person typed.
// Gives back: { ok: true, code, label, discount } or { ok: false, error }.
// It uses check_voucher() (migration 3), which reserves nothing and gives the
// same "isn't valid" message for another client's personal code as for a
// made-up one, so nobody can use this box to find other people's codes.
// book_seat() checks the code again when the person confirms.
export async function previewVoucher(code: unknown): Promise<VoucherPreview> {
  const typed = typeof code === "string" ? code.trim() : "";
  if (!typed) {
    return { ok: false, error: "Please type a voucher code first." };
  }
  // Real codes are short; don't send a huge text to the database
  if (typed.length > 40) {
    return { ok: false, error: "Sorry, that voucher code isn't valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_voucher", { p_code: typed });
  if (error) {
    return { ok: false, error: friendlyDatabaseError(error) };
  }

  const voucher = data[0];
  if (!voucher) {
    return { ok: false, error: "Sorry, that voucher code isn't valid." };
  }
  return {
    ok: true,
    code: voucher.code,
    // (One of these two is empty: a code is either percent or pesos off)
    label: voucherLabel(voucher.percent_off ?? null, voucher.amount_off ?? null),
    discount: Number(voucher.discount),
  };
}

// ---------------------------------------------------------------------------
// HOLD THE SEAT ("Confirm and hold my seat")
// ---------------------------------------------------------------------------

// Holds a seat for the logged-in client by calling book_seat().
// Takes: the previous form state, and the step 2 form:
//   session_id, health_notes (optional), drink_choice, mat_rental (yes/no,
//   chosen on step 1), voucher_code (optional), agreed (on).
// (Change 17: there's no "I am not pregnant" tick any more; the database rule
// was changed with it, migration 15.)
// Name, mobile and Instagram are NOT in the form any more (Revisions part 1):
// they come from the person's profile, which must have a name and mobile.
// "First Pilates class?" isn't asked any more; book_seat() saves false.
// Gives back: field errors or a general error to show. When it works it
// doesn't give anything back: it sends the person to the pay page.
// Special cases (both send the person on instead of showing an error):
//   - they already have a live unpaid hold for this class (a double click,
//     or the back button): go to that hold's pay page
//   - they are already booked and paid for this class: go to its booked page
export async function holdSeat(_previous: HoldSeatState, formData: FormData): Promise<HoldSeatState> {
  const sessionId = readText(formData, "session_id");
  const healthNotes = readText(formData, "health_notes");
  const drinkChoice = readText(formData, "drink_choice");
  const matRental = readText(formData, "mat_rental");
  const voucherCode = readText(formData, "voucher_code");
  // A ticked checkbox sends "on"; an unticked one sends nothing
  const agreed = formData.get("agreed") === "on";

  // Everything typed, so the form can fill it back in after an error
  const values = {
    health_notes: healthNotes,
    drink_choice: drinkChoice,
    mat_rental: matRental,
    voucher_code: voucherCode,
    agreed: agreed ? "on" : "",
  };

  if (!isUuid(sessionId)) {
    return { error: "Please pick a class first.", values, pickAnother: true };
  }

  // --- 1. Friendly checks first, so the person sees every problem at once.
  //        (book_seat checks the important ones again.)
  const settings = await getPublicSettings();
  const fieldErrors: Record<string, string> = {};
  if (healthNotes.length > MAX_HEALTH_NOTES) {
    fieldErrors.health_notes = `Please keep this under ${MAX_HEALTH_NOTES} characters.`;
  }
  if (settings.drinkOptions.length > 0 && !drinkChoice) {
    fieldErrors.drink_choice = "Please pick your free drink.";
  }
  if (matRental !== "yes" && matRental !== "no") {
    // A hidden field from step 1; only a changed page could send anything else
    return { error: "Please pick your class and mat again.", values, pickAnother: true };
  }
  if (!agreed) {
    fieldErrors.agreed = "Please tick this to agree to the Registration Agreement.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  // --- 2. Who is booking? (getClaims checks the login token's signature)
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) {
    // Logged out in another tab: log in again, then come back to this class
    redirect(`/login?next=${encodeURIComponent(`/book/details?session=${sessionId}`)}`);
  }
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) {
    return { error: STAFF_ACCOUNT_ERROR, values };
  }

  // The name and mobile come from their profile now. Row Level Security only
  // lets them read their OWN profile row.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, mobile")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    console.error("Could not read the profile before booking:", profileError.code);
    return { error: GENERIC_ERROR, values };
  }
  if (!profile?.full_name?.trim() || !isValidMobile(profile.mobile ?? "")) {
    return {
      error: "Please add your full name and a valid mobile number in My Profile first, so the cafe can reach you.",
      values,
    };
  }

  // --- 3. Hold the seat. book_seat() does it all in ONE locked step: seat
  //        check, cutoff, one seat per person, prices from settings, voucher
  //        (class fee only), and a 15-minute hold. We never send a price.
  const { data, error } = await supabase.rpc("book_seat", {
    p_session_id: sessionId,
    p_agreed: agreed,
    p_mat_rental: matRental === "yes",
    p_drink_choice: drinkChoice || undefined,
    p_health_notes: healthNotes || undefined,
    p_voucher_code: voucherCode || undefined,
  });

  if (error) {
    // Did they already hold a seat in this class (double click, back button,
    // second tab)? Then don't show an error: take them to that booking.
    const existing = await findMySessionBooking(supabase, sessionId).catch(() => null);
    if (existing?.status === "pending_payment") {
      redirect(`/book/pay/${existing.bookingId}`);
    }
    if (existing?.status === "confirmed" || existing?.status === "attended") {
      redirect(`/book/done/${existing.bookingId}`);
    }

    // Can the class still be booked at all? If not (full, closed, past the
    // cutoff), the form offers "Pick another class".
    const session = await loadSession(sessionId).catch(() => null);
    return {
      error: friendlyDatabaseError(error),
      values,
      pickAnother: !session?.is_bookable,
    };
  }

  const booking = data[0];
  if (!booking) {
    return { error: GENERIC_ERROR, values };
  }

  // --- 4. On to step 3. (redirect() must be the last step, outside try/catch.)
  redirect(`/book/pay/${booking.booking_id}`);
}

// ---------------------------------------------------------------------------
// CHANGE DETAILS (pay page)
// ---------------------------------------------------------------------------

// Gives up the person's own unpaid seat hold straight away, then goes back
// to step 2 for the same class with their choices filled in.
// Takes: the previous state, and the form (booking_id, a hidden field).
// Gives back: an error to show, or (when it works) sends them to
// /book/details?session=<class>&from=<old booking>. Step 2 reads the old
// booking (only if it's theirs) to fill the form back in.
// release_my_hold() (migration 7) checks everything: it must be the caller's
// OWN booking and still 'pending_payment'. It becomes 'expired', which frees
// the seat and any voucher use at once.
// Step 12: a PayMongo checkout still open for this booking is closed FIRST,
// so the old payment page can't be paid after the seat is given up. If it
// was already paid, they go to the return page instead; if a payment is
// going through on it right now, nothing is released.
export async function releaseHold(_previous: ReleaseHoldState, formData: FormData): Promise<ReleaseHoldState> {
  const bookingId = readText(formData, "booking_id");
  if (!isUuid(bookingId)) {
    return { error: "Sorry, we couldn't find that booking." };
  }

  const supabase = await createClient();
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };
  const closed = await closeOpenCheckout(supabase, bookingId);
  if (closed === "paid") redirect(`${getSiteUrl()}/book/pay/${bookingId}/return`);
  if (closed === "in_progress") {
    return { error: "A payment on your PayMongo page is still going through. Please finish it there, or wait a minute." };
  }
  if (closed === "error") {
    return { error: "Sorry, we couldn't reach PayMongo to close your payment page. Please try again in a moment." };
  }

  const { data: sessionId, error } = await supabase.rpc("release_my_hold", { p_booking_id: bookingId });
  if (error || !sessionId) {
    return { error: error ? friendlyDatabaseError(error) : GENERIC_ERROR };
  }

  // Back to step 2 (redirect() must be last, outside try/catch)
  redirect(`/book/details?session=${sessionId}&from=${bookingId}`);
}

// ---------------------------------------------------------------------------
// Small helpers (not exported, so the browser can't call them)
// ---------------------------------------------------------------------------

// Reads a text field from a form and trims spaces from both ends.
// Takes: the form data and the field name.
// Gives back: the text, or "" if it's missing.
function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

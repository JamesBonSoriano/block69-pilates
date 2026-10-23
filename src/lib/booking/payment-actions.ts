"use server";
// Server Actions for PAYING on the pay page (/book/pay/[bookingId]), Step 12.
// Where it's used: src/components/booking/PayHold.tsx (the Pay button and
// "Confirm my free booking") and src/components/booking/ManualTransfer.tsx
// (the GCash / BPI screenshot form).
//   - payOnline():            opens PayMongo's checkout page (GCash, Maya, card)
//   - submitManualTransfer(): sends a transfer screenshot for the cafe to check
//   - confirmFreeBooking():   confirms a 0-peso booking (nothing to pay)
//
// "use server" = these run ONLY on our server. The browser sends just the
// booking id and the chosen method, NEVER an amount: the amount always comes
// from the booking in the database (book_seat() worked it out from settings).
// These actions use the LOGGED-IN client, so the database checks the booking
// is the caller's own. The secret Supabase key is NOT used here.

import { redirect } from "next/navigation";
import { STAFF_ACCOUNT_ERROR, isStaffAccount } from "@/lib/auth/client-guard";
import { bookingReference } from "@/lib/booking-rules";
import type { PaymentState } from "@/lib/booking/form-state";
import { closeOpenCheckout } from "@/lib/booking/checkout";
import { GENERIC_ERROR, friendlyDatabaseError } from "@/lib/database-errors";
import { formatClassDate, formatTime } from "@/lib/format";
import {
  createCheckoutSession,
  expireCheckoutSession,
  isOnlineMethod,
  isPaymongoCheckoutUrl,
  PaymongoError,
  retrieveCheckoutSession,
} from "@/lib/paymongo";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";

// Shown when PayMongo can't be reached or refuses (details go to the log).
const PAYMONGO_PROBLEM =
  "Sorry, we couldn't open PayMongo's payment page just now. Your seat is still held. Please try again in a moment.";

// Shown when an older PayMongo page for this booking is in the middle of a payment.
const PAYMENT_IN_PROGRESS =
  "A payment on your earlier PayMongo page is still going through. Please finish it in that tab, or wait a minute and try again.";

// ---------------------------------------------------------------------------
// PAY ONLINE (GCash, Maya, card through PayMongo)
// ---------------------------------------------------------------------------

// Sends the client to PayMongo's checkout page for their booking.
// Takes: the previous state, and the form: booking_id and method (gcash,
// maya or card).
// Gives back: an error to show, or (when it works) sends the browser to
// PayMongo. PayMongo later sends them back to /book/pay/<id>/return.
//
// Steps:
//   1. start_online_payment() checks the booking (own, unpaid, hold
//      running) and gives back its total and any checkout already open.
//   2. A checkout already open for the SAME method is reused (pressing Pay
//      twice never makes two). One for another method is closed at PayMongo
//      first. One that was already paid goes to the return page.
//   3. A new checkout is made at PayMongo for the booking's total (in centavos).
//   4. save_online_checkout() saves its id on a 'pending' payment row. If
//      another click saved one first, we close ours and use that one.
export async function payOnline(_previous: PaymentState, formData: FormData): Promise<PaymentState> {
  const bookingId = readText(formData, "booking_id");
  const method = readText(formData, "method");
  if (!isUuid(bookingId)) return { error: "Sorry, we couldn't find that booking." };
  if (!isOnlineMethod(method)) return { error: "Please pick GCash, Maya or a card." };

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/book/pay/${bookingId}`)}`);
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };

  // The return check, as a FULL address: it's a route (not a page), so the
  // browser must load it fully instead of the app fetching it in the background
  const returnUrl = `${getSiteUrl()}/book/pay/${bookingId}/return`;

  // --- 1. Can it be paid now? (the database checks the owner and the hold)
  const { data: rows, error } = await supabase.rpc("start_online_payment", { p_booking_id: bookingId });
  const booking = rows?.[0];
  if (error || !booking) return { error: error ? friendlyDatabaseError(error) : GENERIC_ERROR };

  // --- 2. Is a checkout already open for this booking?
  // (redirect() can't be inside try/catch, so we remember where to go.)
  let goTo: string | null = null;
  let replaces: string | null = null;
  if (booking.paymongo_ref) {
    try {
      const open = await retrieveCheckoutSession(booking.paymongo_ref);
      if (open.paid) {
        // Already paid (the client paid, then came back): record it
        goTo = returnUrl;
      } else if (open.status === "active" && booking.method === method && isPaymongoCheckoutUrl(open.checkoutUrl)) {
        // Same method, still open: send them back to the same page
        goTo = open.checkoutUrl;
      } else {
        // Another method (or PayMongo already closed it): close it, make a new one
        const closed = open.status === "active" ? await expireCheckoutSession(open.id) : "closed";
        if (closed === "paid") goTo = returnUrl;
        if (closed === "in_progress") return { error: PAYMENT_IN_PROGRESS };
        replaces = booking.payment_id;
      }
    } catch (problem) {
      console.error("PayMongo (open checkout):", problem instanceof PaymongoError ? problem.message : problem);
      return { error: PAYMONGO_PROBLEM };
    }
  }
  if (goTo) redirect(goTo);

  // --- 3. A new PayMongo checkout for the booking's total
  // Their name and email fill in PayMongo's form (RLS: their own profile only)
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  const site = getSiteUrl();
  let checkout: { id: string; checkoutUrl: string };
  try {
    checkout = await createCheckoutSession({
      bookingId,
      reference: bookingReference(bookingId),
      amountPesos: Number(booking.total),
      method,
      itemName: "Mindful Mat Pilates class",
      itemDescription: `${formatClassDate(booking.class_date).full} · ${formatTime(booking.start_time)} · includes a drink`,
      successUrl: returnUrl,
      cancelUrl: `${site}/book/pay/${bookingId}?payment=cancelled`,
      customer:
        profile?.email && profile.full_name
          ? { name: profile.full_name, email: profile.email }
          : undefined,
    });
  } catch (problem) {
    console.error("PayMongo (create checkout):", problem instanceof PaymongoError ? problem.message : problem);
    return { error: PAYMONGO_PROBLEM };
  }

  // --- 4. Save it on the booking (checked again in the database, with a lock)
  const { data: savedRows, error: saveError } = await supabase.rpc("save_online_checkout", {
    p_booking_id: bookingId,
    p_method: method,
    p_ref: checkout.id,
    p_replaces: replaces ?? undefined,
  });
  const saved = savedRows?.[0];
  if (saveError || !saved) {
    // Couldn't save it (for example the hold ended this very second): close
    // the new checkout so nobody can pay it, then explain
    await expireCheckoutSession(checkout.id).catch(() => null);
    return { error: saveError ? friendlyDatabaseError(saveError) : GENERIC_ERROR };
  }

  let url = checkout.checkoutUrl;
  if (!saved.saved) {
    // Another click saved a checkout first: close ours and use that one
    await expireCheckoutSession(checkout.id).catch(() => null);
    try {
      const other = await retrieveCheckoutSession(saved.paymongo_ref);
      url = other.paid ? returnUrl : other.checkoutUrl;
    } catch (problem) {
      console.error("PayMongo (other checkout):", problem instanceof PaymongoError ? problem.message : problem);
      return { error: PAYMONGO_PROBLEM };
    }
  }

  // Off to PayMongo (only ever a paymongo.com page, or our own return check)
  if (url !== returnUrl && !isPaymongoCheckoutUrl(url)) return { error: PAYMONGO_PROBLEM };
  redirect(url);
}

// ---------------------------------------------------------------------------
// MANUAL GCASH / BPI TRANSFER (backup)
// ---------------------------------------------------------------------------

// Sends a GCash / BPI transfer for the cafe to check.
// The screenshot is uploaded by the BROWSER first, straight into the
// private "payment-screenshots" bucket, inside the client's own folder
// (the storage policies in migration 11 allow nothing else).
// Takes: the previous state, and the form: booking_id, method (gcash or
// bpi) and screenshot_path (where the browser uploaded it).
// Gives back: an error to show, or (when it works) reloads the pay page,
// which then shows "We're checking your payment".
// Steps: close any PayMongo checkout still open for the booking (so it
// can't be paid twice), then submit_manual_payment() checks everything again
// and sets the booking to 'awaiting_verification' (the seat stays held).
export async function submitManualTransfer(_previous: PaymentState, formData: FormData): Promise<PaymentState> {
  const bookingId = readText(formData, "booking_id");
  const method = readText(formData, "method");
  const screenshotPath = readText(formData, "screenshot_path");
  if (!isUuid(bookingId)) return { error: "Sorry, we couldn't find that booking." };
  if (method !== "gcash" && method !== "bpi") return { error: "Please pick GCash or BPI." };

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/book/pay/${bookingId}`)}`);
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };
  // The file must be in their own folder (the database checks this too)
  if (!screenshotPath.startsWith(`${userId}/`)) return { error: "Please upload a screenshot of your transfer first." };

  // Close the PayMongo checkout, if one is open
  const closed = await closeOpenCheckout(supabase, bookingId);
  if (closed === "paid") redirect(`${getSiteUrl()}/book/pay/${bookingId}/return`);
  if (closed === "in_progress") return { error: PAYMENT_IN_PROGRESS };
  if (closed === "error") return { error: PAYMONGO_PROBLEM };

  const { error } = await supabase.rpc("submit_manual_payment", {
    p_booking_id: bookingId,
    p_method: method,
    p_screenshot_path: screenshotPath,
  });
  if (error) return { error: friendlyDatabaseError(error) };

  // The pay page now shows "We're checking your payment"
  redirect(`/book/pay/${bookingId}?payment=sent`);
}

// ---------------------------------------------------------------------------
// FREE BOOKING (total 0 pesos)
// ---------------------------------------------------------------------------

// Confirms a booking that costs nothing (for example a 100% promo code with
// their own mat), since PayMongo can't take a 0-peso payment.
// Takes: the previous state, and the form: booking_id.
// Gives back: an error, or (when it works) goes to the "You're booked" page.
// confirm_free_booking() checks: own booking, unpaid, hold running, total 0.
export async function confirmFreeBooking(_previous: PaymentState, formData: FormData): Promise<PaymentState> {
  const bookingId = readText(formData, "booking_id");
  if (!isUuid(bookingId)) return { error: "Sorry, we couldn't find that booking." };

  const supabase = await createClient();
  // Admin accounts don't book or use My Account (src/lib/auth/client-guard.ts)
  if (await isStaffAccount(supabase)) return { error: STAFF_ACCOUNT_ERROR };
  const { error } = await supabase.rpc("confirm_free_booking", { p_booking_id: bookingId });
  if (error) return { error: friendlyDatabaseError(error) };
  redirect(`/book/done/${bookingId}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Reads a text field from a form and trims spaces from both ends.
// Takes: the form data and the field name.
// Gives back: the text, or "" if it's missing.
function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

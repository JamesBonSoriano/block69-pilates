// The PayMongo "return" check: /book/pay/<booking id>/return
// Where it's used: PayMongo sends the client here after paying (the
// success_url set in src/lib/booking/payment-actions.ts). The "Check again"
// button on /book/pay/<id>/checking comes back here too.
//
// Why it exists: PayMongo's webhook can't reach a laptop running
// localhost, so on its own the booking would never get confirmed while we
// develop. This route asks PayMongo ITSELF (with our secret key) whether
// the booking's checkout was paid, and if so records it with the SAME
// database function the webhook uses (confirm_online_payment). Both are safe
// to run together: the function does nothing the second time.
//
// What happens:
//   not logged in                 -> the proxy sends them to log in first
//   not their booking             -> the pay page (which says "not found")
//   already paid                  -> /book/done/<id>
//   PayMongo says it's paid       -> record it, then /book/done/<id>
//   not paid (yet)                -> /book/pay/<id>/checking ("Checking your
//                                    payment…" with a Check again button)
//
// SECURITY: we first check the booking is the logged-in client's OWN (the
// normal logged-in client + get_my_booking). Only then does the SECRET-key
// Supabase client read its payment rows and call confirm_online_payment.
// Nothing from the address is trusted except the booking id, and the
// amount comes from PayMongo, never from the browser.

import { redirect } from "next/navigation";
import { PaymongoError, retrieveCheckoutSession } from "@/lib/paymongo";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isUuid } from "@/lib/validation";
import type { PaymentMethod } from "@/types/app";

// Statuses that mean the booking is already settled as paid.
const PAID_STATUSES = new Set(["confirmed", "attended", "paid_needs_action"]);

// Checks the booking's PayMongo checkouts and records a payment.
// Takes: the request (unused) and the booking id from the address.
// Gives back: a redirect (see the list at the top).
export async function GET(_request: Request, { params }: RouteContext<"/book/pay/[bookingId]/return">) {
  const { bookingId } = await params;
  if (!isUuid(bookingId)) redirect("/account/bookings");

  // --- 1. Their own booking? (logged-in client: RLS + owner check)
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) redirect(`/login?next=${encodeURIComponent(`/book/pay/${bookingId}/return`)}`);

  const { data: rows } = await supabase.rpc("get_my_booking", { p_booking_id: bookingId });
  const booking = rows?.[0];
  if (!booking) redirect(`/book/pay/${bookingId}`); // shows "page not found"
  if (PAID_STATUSES.has(booking.status)) redirect(`/book/done/${bookingId}`);

  // --- 2. Ask PayMongo about this booking's checkouts (newest first) and
  //        record the first one that was paid.
  const outcome = await checkAndConfirm(bookingId);
  if (outcome === "paid") redirect(`/book/done/${bookingId}`);
  redirect(`/book/pay/${bookingId}/checking${outcome === "problem" ? "?problem=1" : ""}`);
}

// Looks up the booking's PayMongo checkouts and confirms a paid one.
// Takes: the booking id (already checked to be the caller's own).
// Gives back: "paid" (recorded now, or already), "not_paid", or "problem"
// (PayMongo or the database couldn't be reached; details go to the log).
async function checkAndConfirm(bookingId: string): Promise<"paid" | "not_paid" | "problem"> {
  try {
    const service = createServiceClient();
    // The checkouts made for this booking (an expired one may still have
    // been paid just before it was closed, so we check a few)
    const { data: payments, error } = await service
      .from("payments")
      .select("paymongo_ref")
      .eq("booking_id", bookingId)
      .eq("provider", "paymongo")
      .not("paymongo_ref", "is", null)
      .order("created_at", { ascending: false })
      .limit(3);
    if (error) throw new Error(`Could not read payments: ${error.message}`);

    for (const { paymongo_ref: ref } of payments) {
      if (!ref) continue;
      const checkout = await retrieveCheckoutSession(ref);
      if (!checkout.paid) continue;
      // The checkout must be for THIS booking (we wrote booking_id into its metadata)
      if (checkout.bookingId !== bookingId) {
        console.error("PayMongo checkout metadata doesn't match its booking:", ref);
        continue;
      }
      const { error: confirmError } = await service.rpc("confirm_online_payment", {
        p_checkout_ref: checkout.id,
        p_booking_id: bookingId,
        p_amount: checkout.paid.amountPesos,
        // Empty when PayMongo didn't say (the database keeps the method we
      // saved). The generated types don't know this argument may be empty.
      p_method: checkout.paid.method as PaymentMethod,
        p_paid_at: checkout.paid.paidAt ?? undefined,
      });
      if (confirmError) throw new Error(`confirm_online_payment: ${confirmError.message}`);
      return "paid";
    }
    return "not_paid";
  } catch (problem) {
    console.error("Payment return check:", problem instanceof PaymongoError ? problem.message : problem);
    return "problem";
  }
}

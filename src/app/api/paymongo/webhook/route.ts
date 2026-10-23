// The PayMongo webhook: POST /api/paymongo/webhook
// Where it's used: PayMongo calls this address by itself whenever something
// happens to a payment (we add the address in PayMongo's dashboard in
// Step 13, once the site is online; PayMongo can't reach localhost).
// It confirms bookings even if the client closes the tab right after paying.
//
// What it does:
//   1. Reads the body EXACTLY as sent (raw text) and checks the
//      Paymongo-Signature header with our webhook secret
//      (src/lib/paymongo-signature.ts). Wrong or missing -> 401, nothing done.
//   2. Only "checkout_session.payment.paid" in TEST mode is handled. Every
//      other event gets a quick 200 ("received, ignored"), so PayMongo
//      doesn't keep resending it.
//   3. Calls confirm_online_payment() with the SECRET-key Supabase client.
//      That one database function also serves the return page, applies the
//      late payment rule, and does nothing if the payment was already
//      recorded, so PayMongo resending the same event is harmless.
//      If the database fails we answer 500, so PayMongo tries again later.
//
// We never log the body or the secret, only event ids and short messages.

import { NextResponse } from "next/server";
import { isValidPaymongoSignature } from "@/lib/paymongo-signature";
import { readCheckoutSession } from "@/lib/paymongo";
import { createServiceClient } from "@/lib/supabase/service";
import { isUuid } from "@/lib/validation";
import type { PaymentMethod } from "@/types/app";

// Handles one webhook call from PayMongo.
// Takes: the request (raw body + Paymongo-Signature header).
// Gives back: 401 (bad signature), 400 (not JSON), 500 (database problem,
// PayMongo retries) or 200 (handled or ignored).
export async function POST(request: Request) {
  // --- 1. Is it really from PayMongo?
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET ?? "";
  const rawBody = await request.text();
  if (!isValidPaymongoSignature(rawBody, request.headers.get("paymongo-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // --- 2. Which event is it? (only parsed AFTER the signature check)
  let event: { data?: { id?: unknown; attributes?: { type?: unknown; livemode?: unknown; data?: unknown } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Not JSON" }, { status: 400 });
  }
  const eventId = typeof event.data?.id === "string" ? event.data.id : "unknown";
  const attributes = event.data?.attributes;

  if (attributes?.type !== "checkout_session.payment.paid") {
    return NextResponse.json({ received: true, ignored: true });
  }
  // We only take TEST payments for this project (CLAUDE.md section 2)
  if (attributes.livemode !== false) {
    console.warn("PayMongo webhook: a live-mode event was ignored:", eventId);
    return NextResponse.json({ received: true, ignored: true });
  }

  // The event's data is the whole Checkout Session, with its payments
  const checkout = readCheckoutSession(attributes.data);
  if (!checkout?.paid || !checkout.bookingId || !isUuid(checkout.bookingId)) {
    // Not one of our booking checkouts (or no paid payment in it): nothing to do
    console.warn("PayMongo webhook: paid event without a booking or payment:", eventId);
    return NextResponse.json({ received: true, ignored: true });
  }

  // --- 3. Record it (the same function the return page uses)
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("confirm_online_payment", {
      p_checkout_ref: checkout.id,
      p_booking_id: checkout.bookingId,
      p_amount: checkout.paid.amountPesos,
      // Empty when PayMongo didn't say (the database keeps the method we
      // saved). The generated types don't know this argument may be empty.
      p_method: checkout.paid.method as PaymentMethod,
      p_paid_at: checkout.paid.paidAt ?? undefined,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ received: true, outcome: data?.[0]?.outcome ?? null });
  } catch (problem) {
    console.error("PayMongo webhook: could not record payment for event", eventId, problem instanceof Error ? problem.message : "");
    // 500 = "please try again later": PayMongo resends it
    return NextResponse.json({ error: "Could not record the payment" }, { status: 500 });
  }
}

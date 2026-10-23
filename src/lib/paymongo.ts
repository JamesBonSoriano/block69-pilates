// Talks to PayMongo (TEST mode) with our secret key.
// Where it's used: the pay page's actions (src/lib/booking/payment-actions.ts),
// the return route (src/app/(client)/book/pay/[bookingId]/return/route.ts)
// and the webhook (src/app/api/paymongo/webhook/route.ts).
//
// What PayMongo calls a "Checkout Session" is the payment page it hosts for
// us (checkout.paymongo.com). We:
//   1. create one for a booking (createCheckoutSession), then send the
//      client to its checkout_url,
//   2. look it up later to see if it was paid (retrieveCheckoutSession),
//   3. close it when the client gives up the seat or switches method
//      (expireCheckoutSession). PayMongo sessions have NO expiry time we
//      can set: they stay open until we expire them.
//
// Money: our database keeps pesos (550.00). PayMongo wants whole CENTAVOS
// (55000), so we multiply by 100 here and divide by 100 when reading back.
//
// SECURITY: the secret key (PAYMONGO_SECRET_KEY) is read only here, only on
// the server ("server-only" stops browser code importing this file), and is
// never logged or shown. We log only PayMongo's error codes.
// Field names below are from PayMongo's API reference (Create / Retrieve /
// Expire a Checkout Session, and the Checkout Session resource).

import "server-only";
import type { PaymentMethod } from "@/types/app";

// PayMongo's API address.
const API = "https://api.paymongo.com/v1";

// Our method names -> PayMongo's payment_method_types (Maya is "paymaya").
const PAYMONGO_TYPES = { gcash: "gcash", maya: "paymaya", card: "card" } as const;

// The methods clients can pick for an online payment.
export type OnlineMethod = keyof typeof PAYMONGO_TYPES;

// Checks a value is one of the online methods (gcash, maya, card).
// Takes: anything. Gives back: true / false.
export function isOnlineMethod(value: unknown): value is OnlineMethod {
  return value === "gcash" || value === "maya" || value === "card";
}

// A problem talking to PayMongo. The message is safe to log (no keys).
export class PaymongoError extends Error {
  status: number; // the HTTP status PayMongo answered with (0 = no answer)
  constructor(message: string, status: number) {
    super(message);
    this.name = "PaymongoError";
    this.status = status;
  }
}

// What we need from a Checkout Session.
export type CheckoutInfo = {
  id: string; // "cs_..."
  status: string; // "active" or "expired"
  checkoutUrl: string; // where to send the client
  bookingId: string | null; // from metadata (only our server writes it)
  // The paid payment, if there is one (at most one per session)
  paid: { amountPesos: number; method: PaymentMethod | null; paidAt: string | null } | null;
};

// Turns a peso amount into whole centavos for PayMongo.
// Takes: pesos (e.g. 550 or "550.00"). Gives back: e.g. 55000.
export function toCentavos(pesos: number | string): number {
  return Math.round(Number(pesos) * 100);
}

// Sends one request to PayMongo with our secret key.
// Takes: the method (GET / POST), the path (e.g. "/checkout_sessions") and
// an optional JSON body.
// Gives back: the parsed JSON answer. Throws a PaymongoError if the key is
// missing, PayMongo can't be reached, or it answers with an error.
async function paymongoRequest(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    throw new PaymongoError("PAYMONGO_SECRET_KEY is missing in .env.local.", 0);
  }

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        // "Basic auth": the secret key as the user name, an empty password
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", // payment answers must never be cached
      signal: AbortSignal.timeout(15_000), // give up after 15 seconds
    });
  } catch {
    throw new PaymongoError("Couldn't reach PayMongo.", 0);
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // PayMongo errors look like { errors: [{ code, detail }] }. We keep
    // only the codes and details (they never contain our key).
    const errors = (json as { errors?: { code?: string; detail?: string }[] } | null)?.errors ?? [];
    const summary = errors.map((e) => `${e.code ?? "error"}: ${e.detail ?? ""}`).join("; ");
    throw new PaymongoError(`PayMongo answered ${response.status}${summary ? ` (${summary})` : ""}`, response.status);
  }
  return json;
}

// Reads the parts we need from a Checkout Session object (the "data" part
// of PayMongo's answer, or the session inside a webhook event).
// Takes: the session object as PayMongo sent it.
// Gives back: a CheckoutInfo, or null if it doesn't look like a session.
export function readCheckoutSession(session: unknown): CheckoutInfo | null {
  const s = session as {
    id?: unknown;
    attributes?: {
      status?: unknown;
      checkout_url?: unknown;
      metadata?: { booking_id?: unknown } | null;
      payments?: { attributes?: { status?: unknown; amount?: unknown; paid_at?: unknown; source?: { type?: unknown } } }[];
    };
  } | null;
  if (!s || typeof s.id !== "string" || !s.id.startsWith("cs_") || !s.attributes) return null;

  const attributes = s.attributes;
  // The one payment marked "paid" (PayMongo: at most one per session)
  const paidPayment = (attributes.payments ?? []).find((p) => p?.attributes?.status === "paid")?.attributes;
  let paid: CheckoutInfo["paid"] = null;
  if (paidPayment && typeof paidPayment.amount === "number") {
    paid = {
      amountPesos: paidPayment.amount / 100,
      method: methodFromSource(paidPayment.source?.type),
      // paid_at is in seconds since 1970; we pass it on as an ISO date
      paidAt: typeof paidPayment.paid_at === "number" ? new Date(paidPayment.paid_at * 1000).toISOString() : null,
    };
  }

  return {
    id: s.id,
    status: typeof attributes.status === "string" ? attributes.status : "",
    checkoutUrl: typeof attributes.checkout_url === "string" ? attributes.checkout_url : "",
    bookingId: typeof attributes.metadata?.booking_id === "string" ? attributes.metadata.booking_id : null,
    paid,
  };
}

// Turns PayMongo's payment source type into our method name.
// Takes: e.g. "gcash", "paymaya", "card".
// Gives back: "gcash", "maya", "card", or null for anything else.
function methodFromSource(type: unknown): PaymentMethod | null {
  if (type === "gcash") return "gcash";
  if (type === "paymaya") return "maya";
  if (type === "card") return "card";
  return null;
}

// Details for a new checkout.
type NewCheckout = {
  bookingId: string; // saved in metadata, so the webhook knows the booking
  reference: string; // our booking number, e.g. "B69-1A2B3C4D"
  amountPesos: number; // the booking's total, read from the DATABASE
  method: OnlineMethod; // the only method PayMongo's page will offer
  itemName: string; // e.g. "Mindful Mat Pilates class"
  itemDescription: string; // e.g. "Thu, Oct 23 · 9:00 AM"
  successUrl: string; // where PayMongo sends the client after paying
  cancelUrl: string; // where PayMongo's "back" link goes
  customer?: { name?: string; email?: string; phone?: string }; // pre-fills PayMongo's form
};

// Creates a PayMongo Checkout Session for one booking.
// Takes: the details above.
// Gives back: the session's id ("cs_...") and the page to send the client to.
// Throws a PaymongoError if PayMongo refuses (for example an amount below
// its minimum) or can't be reached.
export async function createCheckoutSession(details: NewCheckout): Promise<{ id: string; checkoutUrl: string }> {
  const json = await paymongoRequest("POST", "/checkout_sessions", {
    data: {
      attributes: {
        line_items: [
          {
            name: details.itemName,
            description: details.itemDescription.slice(0, 255), // PayMongo allows 255 characters
            amount: toCentavos(details.amountPesos),
            currency: "PHP",
            quantity: 1,
          },
        ],
        payment_method_types: [PAYMONGO_TYPES[details.method]],
        description: `Booking ${details.reference}`,
        reference_number: details.reference,
        success_url: details.successUrl,
        cancel_url: details.cancelUrl,
        send_email_receipt: false, // our own emails come in Phase E
        show_line_items: true,
        // Only text values are allowed in metadata
        metadata: { booking_id: details.bookingId },
        ...(details.customer ? { billing: details.customer } : {}),
      },
    },
  });

  const session = readCheckoutSession((json as { data?: unknown } | null)?.data);
  if (!session || !isPaymongoCheckoutUrl(session.checkoutUrl)) {
    throw new PaymongoError("PayMongo's answer had no checkout page.", 200);
  }
  return { id: session.id, checkoutUrl: session.checkoutUrl };
}

// Looks up one Checkout Session (with the secret key, so it includes the payments).
// Takes: the session id ("cs_...").
// Gives back: its CheckoutInfo. Throws a PaymongoError if it can't.
export async function retrieveCheckoutSession(id: string): Promise<CheckoutInfo> {
  if (!/^cs_[A-Za-z0-9]{1,100}$/.test(id)) throw new PaymongoError("Not a checkout id.", 0);
  const json = await paymongoRequest("GET", `/checkout_sessions/${id}`);
  const session = readCheckoutSession((json as { data?: unknown } | null)?.data);
  if (!session) throw new PaymongoError("PayMongo's answer wasn't a checkout session.", 200);
  return session;
}

// Closes a Checkout Session, so nobody can pay it any more.
// Takes: the session id.
// Gives back:
//   "closed"       it's closed now (or was already)
//   "paid"         it was already paid: the caller should confirm it instead
//   "in_progress"  a payment is being made on it right now, so PayMongo won't
//                  close it: the client should finish (or wait)
// Throws a PaymongoError only if PayMongo can't be reached or answers oddly.
export async function expireCheckoutSession(id: string): Promise<"closed" | "paid" | "in_progress"> {
  try {
    await paymongoRequest("POST", `/checkout_sessions/${id}/expire`);
    return "closed";
  } catch (error) {
    // PayMongo answers 400 when it's already expired, already paid, or a
    // payment is in progress. Look it up to see which.
    if (!(error instanceof PaymongoError) || error.status !== 400) throw error;
    const session = await retrieveCheckoutSession(id);
    if (session.paid) return "paid";
    if (session.status === "expired") return "closed";
    return "in_progress";
  }
}

// Checks a checkout page address really is PayMongo's, before we send a
// client there (so a strange answer can never send them somewhere else).
// Takes: the address. Gives back: true for https://...paymongo.com/... only.
export function isPaymongoCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "paymongo.com" || parsed.hostname.endsWith(".paymongo.com"));
  } catch {
    return false;
  }
}

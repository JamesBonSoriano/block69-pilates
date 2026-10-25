// Download a client's receipt as a PDF: GET /account/payments/<payment id>/pdf
// Where it's used: the "Download receipt (PDF)" button on the receipt page
// (/account/payments/[paymentId]).
//
// ONLY THE PAYMENT'S OWNER: the server checks the login, and
// get_my_payments(id) (migration 8) only gives back the caller's OWN
// payment, so someone else's id gets "not found". Admins download from
// /admin/receipt/<booking id>/pdf instead. Only PAID payments have a receipt.
// The file: Block69-Receipt-<receipt no>.pdf (src/lib/receipt-pdf.ts).

import { getPublicSettings } from "@/lib/data/settings";
import { clientReceiptData, receiptErrorResponse, receiptPdfResponse } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { MyPayment } from "@/types/app";

// Makes and sends the PDF.
// Takes: the request (not used) and the payment id from the address.
// Gives back: the PDF download, or a short message (401 not logged in,
// 404 not found / not yours, 409 not paid, 500 something went wrong).
export async function GET(_request: Request, { params }: RouteContext<"/account/payments/[paymentId]/pdf">) {
  const { paymentId } = await params;
  if (!isUuid(paymentId)) return receiptErrorResponse(404, "We couldn't find that receipt.");

  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return receiptErrorResponse(401, "Please log in to download your receipt.");

    // Only the caller's own payment comes back (checked inside the database)
    const { data, error } = await supabase.rpc("get_my_payments", { p_payment_id: paymentId });
    if (error) throw new Error(error.message);
    const payment = data[0] as MyPayment | undefined;
    if (!payment) return receiptErrorResponse(404, "We couldn't find that receipt.");
    if (payment.status !== "paid") {
      return receiptErrorResponse(409, "This payment isn't paid, so there is no receipt to download.");
    }

    // The client's name for "Client" (their own row: Row Level Security)
    const [{ data: profile }, settings] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
      getPublicSettings(),
    ]);
    const receipt = clientReceiptData(
      payment,
      { name: profile?.full_name?.trim() ?? "", email: profile?.email || user.email || "" },
      { name: settings.cafeName, address: settings.cafeAddress, email: settings.cafeEmail },
    );
    return await receiptPdfResponse(receipt);
  } catch (error) {
    console.error("Receipt PDF failed:", error);
    return receiptErrorResponse(500, "Sorry, we couldn't make the PDF right now. Please try again in a moment.");
  }
}

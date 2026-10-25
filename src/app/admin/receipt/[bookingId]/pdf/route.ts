// Download a booking's receipt as a PDF (admins): GET /admin/receipt/<booking id>/pdf
// Where it's used: the "Download receipt (PDF)" button on the admin receipt
// page (/admin/receipt/[bookingId]).
//
// ADMINS ONLY: src/proxy.ts keeps guests and clients out of /admin, this
// route checks is_admin() AGAIN, and admin_get_booking() (migration 9)
// refuses anyone who isn't an active admin. Only a booking with a PAID
// payment has a receipt. The file: Block69-Receipt-<receipt no>.pdf.

import { isAdmin } from "@/lib/admin/action-helpers";
import { getPublicSettings } from "@/lib/data/settings";
import { adminReceiptData, receiptErrorResponse, receiptPdfResponse } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { AdminBookingDetails } from "@/types/app";

// Makes and sends the PDF.
// Takes: the request (not used) and the booking id from the address.
// Gives back: the PDF download, or a short message (403 not an admin,
// 404 not found, 409 nothing paid yet, 500 something went wrong).
export async function GET(_request: Request, { params }: RouteContext<"/admin/receipt/[bookingId]/pdf">) {
  const { bookingId } = await params;
  if (!isUuid(bookingId)) return receiptErrorResponse(404, "We couldn't find that booking.");

  try {
    const supabase = await createClient();
    if (!(await isAdmin(supabase))) return receiptErrorResponse(403, "Only admins can download this receipt.");

    const { data, error } = await supabase.rpc("admin_get_booking", { p_booking_id: bookingId });
    if (error) throw new Error(error.message);
    // "payments" arrives as a JSON list; AdminBookingDetails describes it
    const booking = data[0] as unknown as AdminBookingDetails | undefined;
    if (!booking) return receiptErrorResponse(404, "We couldn't find that booking.");

    const settings = await getPublicSettings();
    const receipt = adminReceiptData(booking, {
      name: settings.cafeName,
      address: settings.cafeAddress,
      email: settings.cafeEmail,
    });
    if (!receipt) return receiptErrorResponse(409, "This booking has no paid payment yet, so there is no receipt.");
    return await receiptPdfResponse(receipt);
  } catch (error) {
    console.error("Receipt PDF failed:", error);
    return receiptErrorResponse(500, "Sorry, we couldn't make the PDF right now. Please try again in a moment.");
  }
}

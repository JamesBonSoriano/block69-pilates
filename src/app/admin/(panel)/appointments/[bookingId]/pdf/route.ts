// Download one appointment's details as a PDF (admins):
// GET /admin/appointments/<booking id>/pdf
// Where it's used: the "Download Receipt" button on the eye view
// (/admin/appointments/[bookingId]), Version 1.6 (renamed in Version 1.7).
//
// ADMINS ONLY: src/proxy.ts keeps guests and clients out of /admin, this
// route checks is_admin() AGAIN, and admin_get_booking() (migration 9)
// refuses anyone who isn't an active admin. The PDF is drawn with the same
// code as the receipts (src/lib/receipt-pdf.ts). The file:
// Block69-Appointment-<booking no>.pdf.

import { isAdmin } from "@/lib/admin/action-helpers";
import { bookingDetailsStatus } from "@/lib/admin/appointment-status";
import { getPublicSettings } from "@/lib/data/settings";
import {
  adminBookingPdfData,
  bookingPdfResponse,
  receiptErrorResponse,
} from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation";
import type { AdminBookingChangeInfo, AdminBookingDetails } from "@/types/app";

// Makes and sends the PDF.
// Takes: the request (not used) and the booking id from the address.
// Gives back: the PDF download, or a short message (403 not an admin,
// 404 not found, 500 something went wrong).
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/appointments/[bookingId]/pdf">,
) {
  const { bookingId } = await params;
  if (!isUuid(bookingId))
    return receiptErrorResponse(404, "We couldn't find that appointment.");

  try {
    const supabase = await createClient();
    // Security: check the admin role on the server, not only in the menu
    if (!(await isAdmin(supabase)))
      return receiptErrorResponse(403, "Only admins can download this.");

    const { data, error } = await supabase.rpc("admin_get_booking", {
      p_booking_id: bookingId,
    });
    if (error) throw new Error(error.message);
    // "payments" arrives as a JSON list; AdminBookingDetails describes it
    const booking = data[0] as unknown as AdminBookingDetails | undefined;
    if (!booking)
      return receiptErrorResponse(404, "We couldn't find that appointment.");

    // Version 1.7: the admin log, so an admin cancel says what the cafe gave
    // (e.g. "Refunded outside the website"). Not fatal if it can't be read.
    const { data: changeRows } = await supabase.rpc(
      "admin_booking_change_info",
      { p_booking_id: bookingId },
    );
    const change =
      (changeRows?.[0] as unknown as AdminBookingChangeInfo | undefined) ??
      null;

    const settings = await getPublicSettings();
    const nowMs = Date.now();
    const pdfData = adminBookingPdfData(
      booking,
      {
        name: settings.cafeName,
        address: settings.cafeAddress,
        email: settings.cafeEmail,
      },
      bookingDetailsStatus(booking, nowMs, change?.actions ?? []).text,
      nowMs,
    );
    return await bookingPdfResponse(pdfData);
  } catch (error) {
    console.error("Appointment PDF failed:", error);
    return receiptErrorResponse(
      500,
      "Sorry, we couldn't make the PDF right now. Please try again in a moment.",
    );
  }
}

// Version 1.9: emails the cafe when a client books (Settings > Alerts >
// "Alert email (admins only)", the admin_alert_email setting).
// Where it's used:
//   - src/app/api/paymongo/webhook/route.ts and
//     src/app/(client)/book/pay/[bookingId]/return/route.ts (a PayMongo
//     payment was just recorded: confirmed, or "paid, needs action")
//   - src/lib/booking/payment-actions.ts (a GCash / BPI screenshot was sent,
//     or a free booking was confirmed)
//
// "A client books" = the moment a booking is really in: paid, sent for
// checking, or free. A seat HOLD alone (step 2, not paid yet) sends nothing,
// because most of those either get paid (and then send this) or simply end.
//
// queueAdminBookingAlert() uses Next.js after(): the email is sent AFTER the
// client's page has answered, so a slow Gmail never keeps the client waiting.
// It NEVER throws: a missing SMTP key or alert email is only logged.
//
// SERVER ONLY. It uses the secret Supabase key (createServiceClient),
// because the alert email is an admin-only setting a client can't read, and
// the booking's client may not be the person whose request this is (the
// PayMongo webhook has no logged-in user at all).

import "server-only";
import { after } from "next/server";
import { bookingReference } from "@/lib/booking-rules";
import { emailIsSetUp, sendEmail } from "@/lib/email";
import { adminBookingAlertEmail, type AdminBookingAlertKind } from "@/lib/email-text";
import { formatClassDate, formatPeso, formatTimeRange } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

// Schedules the "new booking" email to the admin, to be sent after the
// response.
// Takes: the booking id and how it came in (see AdminBookingAlertKind in
// src/lib/email-text.ts).
// Gives back: nothing (the email goes out in the background).
export function queueAdminBookingAlert(bookingId: string, kind: AdminBookingAlertKind): void {
  after(() => sendAdminBookingAlert(bookingId, kind));
}

// Sends the "new booking" email to the admin alert address now.
// Takes: the booking id and how it came in.
// Gives back: true if Gmail accepted the email, false if it was skipped or
// failed (the reason goes to the server log). Never throws.
export async function sendAdminBookingAlert(bookingId: string, kind: AdminBookingAlertKind): Promise<boolean> {
  try {
    if (!emailIsSetUp()) {
      console.warn("Admin booking alert skipped: the SMTP keys are missing in .env.local.");
      return false;
    }
    const service = createServiceClient();

    // The alert address and the cafe details (settings; the alert email is
    // admin-only, is_public = false, which is why the secret key is used)
    const { data: settingRows, error: settingsError } = await service
      .from("settings")
      .select("key, value")
      .in("key", ["admin_alert_email", "cafe_name", "cafe_address", "cafe_email"]);
    if (settingsError) throw new Error(`Could not read settings: ${settingsError.message}`);
    // Settings are saved as JSON; these four are plain text values
    const setting = (key: string) => {
      const value = settingRows.find((row) => row.key === key)?.value;
      return typeof value === "string" ? value.trim() : "";
    };
    const alertEmail = setting("admin_alert_email");
    if (!alertEmail) {
      console.warn("Admin booking alert skipped: Settings > Alerts > Alert email is empty.");
      return false;
    }

    // The booking with its class and client (one row, by its id)
    const { data: booking, error: bookingError } = await service
      .from("bookings")
      .select(
        "id, user_id, walkin_name, walkin_contact, drink_choice, mat_rental, total, " +
          "class_sessions ( date, start_time, end_time ), profiles!bookings_user_id_fkey ( full_name, email, mobile )",
      )
      .eq("id", bookingId)
      .maybeSingle<BookingForAlert>();
    if (bookingError) throw new Error(`Could not read the booking: ${bookingError.message}`);
    if (!booking || !booking.class_sessions) {
      console.warn("Admin booking alert skipped: booking not found:", bookingId);
      return false;
    }

    const session = booking.class_sessions;
    const profile = booking.profiles;
    const cafe = {
      name: setting("cafe_name") || "Block 69 Cafe",
      address: setting("cafe_address"),
      email: setting("cafe_email"),
    };
    const email = adminBookingAlertEmail(
      {
        kind,
        reference: bookingReference(booking.id),
        clientName: profile?.full_name?.trim() || booking.walkin_name || profile?.email || "Guest",
        clientEmail: profile?.email ?? null,
        clientMobile: profile?.mobile ?? booking.walkin_contact ?? null,
        classDate: formatClassDate(session.date).full,
        classTime: formatTimeRange(session.start_time, session.end_time),
        drink: booking.drink_choice,
        matRental: booking.mat_rental,
        total: formatPeso(Number(booking.total)),
        adminUrl: `${getSiteUrl()}/admin/appointments/${booking.id}`,
      },
      cafe,
    );

    // Send it; replies go to the client (so the admin can answer them directly)
    const result = await sendEmail({
      to: alertEmail,
      ...email,
      replyTo: profile?.email ?? undefined,
    });
    if (!result.ok) {
      console.error("Admin booking alert failed:", result.error);
      return false;
    }

    // Keep a record in the email history (type admin_alert). The email went
    // to the cafe, not to a client, so user_id stays empty.
    const { error: logError } = await service
      .from("email_log")
      .insert({ booking_id: booking.id, type: "admin_alert" });
    if (logError) console.error("Admin booking alert sent, but not logged:", logError.message);
    return true;
  } catch (problem) {
    console.error("Admin booking alert failed:", problem instanceof Error ? problem.message : problem);
    return false;
  }
}

// The shape of the booking row the query above gives back.
type BookingForAlert = {
  id: string;
  user_id: string | null;
  walkin_name: string | null;
  walkin_contact: string | null;
  drink_choice: string | null;
  mat_rental: boolean;
  total: number;
  class_sessions: { date: string; start_time: string; end_time: string } | null;
  profiles: { full_name: string | null; email: string | null; mobile: string | null } | null;
};

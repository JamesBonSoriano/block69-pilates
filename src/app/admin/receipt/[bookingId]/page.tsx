// A receipt for one booking: /admin/receipt/<booking id>
// Where it's used: the "View receipt" button on the admin booking details
// page (src/app/admin/(panel)/bookings/[bookingId]/page.tsx), Version 1.4.
//
// It sits outside the admin frame (src/app/admin/(panel)/), so there's no side
// menu or tab bar, just the receipt (ReceiptSheet: narrow, like a shop
// receipt). Above it: Back and "Download receipt (PDF)" (a real PDF made on
// the server by ./pdf/route.ts, named Block69-Receipt-<receipt no>.pdf).
// People who want paper print that PDF.
//
// What the receipt shows: the cafe's name, address and email (Settings), the
// receipt and booking numbers, the date paid, the client, the class, the
// items and total SAVED on the booking (nothing is recalculated), every PAID
// payment with its method and PayMongo reference, and the Paid status.
// No card or bank numbers are ever stored, so none can show here.
//
// Protection: src/proxy.ts sends guests to /admin/login and clients away
// (this is an /admin page), requireAdmin() checks AGAIN, and the database's
// admin_get_booking() refuses anyone who isn't an active admin.

import { ArrowLeft } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminLoadError, AdminLoading } from "@/components/admin/AdminUi";
import { DownloadReceiptButton } from "@/components/receipt/DownloadReceiptButton";
import { ReceiptSheet } from "@/components/receipt/ReceiptSheet";
import { requireAdmin } from "@/lib/auth/user";
import { getAdminBooking } from "@/lib/data/admin";
import { getPublicSettings } from "@/lib/data/settings";
import { adminReceiptData } from "@/lib/receipt";
import type { AdminBookingDetails } from "@/types/app";

// Tab title. Private page.
export const metadata: Metadata = { title: "Receipt · Admin", robots: { index: false } };

// The phone's own top bar stays admin brown here, like the admin frame.
export const viewport: Viewport = { themeColor: "#43271B" };

// The receipt page.
// Takes: params (the booking id from the address).
// Gives back: the admin-colored page with the receipt inside <Suspense>
// (it reads the login and live data).
export default function AdminReceiptPage({ params }: PageProps<"/admin/receipt/[bookingId]">) {
  return (
    // data-theme="admin" keeps the brown admin colors (see globals.css).
    // On paper the background is plain white.
    <main
      id="main"
      data-theme="admin"
      className="flex flex-1 flex-col items-center bg-admin-bg px-4 py-6 print:bg-white print:p-0 lg:py-10"
    >
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <Suspense fallback={<AdminLoading label="the receipt" blocks={2} />}>
          <Receipt params={params} />
        </Suspense>
      </div>
    </main>
  );
}

// Loads the booking and the cafe details, then draws the receipt.
// Takes: the params promise.
// Gives back: the Back / Download row and the receipt sheet, a short
// message if nothing was paid yet, or the "page not found" page for a wrong id.
async function Receipt({ params }: { params: PageProps<"/admin/receipt/[bookingId]">["params"] }) {
  await requireAdmin();
  const { bookingId } = await params;

  let booking: AdminBookingDetails | null;
  let settings;
  try {
    [booking, settings] = await Promise.all([getAdminBooking(bookingId), getPublicSettings()]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals (e.g. redirects)
    console.error(error);
    return <AdminLoadError what="the receipt" />;
  }
  if (!booking) notFound();

  // Only money actually received goes on a receipt (null = nothing paid yet)
  const receipt = adminReceiptData(booking, {
    name: settings.cafeName,
    address: settings.cafeAddress,
    email: settings.cafeEmail,
  });

  const backLink = (
    <Link
      href={`/admin/bookings/${booking.booking_id}`}
      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-full text-sm font-semibold text-brown hover:underline print:hidden"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      Back to the booking
    </Link>
  );

  if (!receipt) {
    return (
      <>
        {backLink}
        <p className="rounded-3xl border border-admin-line bg-white p-6 text-sm text-muted">
          This booking has no paid payment yet, so there is no receipt.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between print:hidden">
        {backLink}
        <DownloadReceiptButton href={`/admin/receipt/${booking.booking_id}/pdf`} />
      </div>
      <ReceiptSheet data={receipt} />
    </>
  );
}

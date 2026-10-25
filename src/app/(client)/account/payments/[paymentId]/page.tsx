// A payment receipt: /account/payments/<payment id>
// Where it's used: the "Receipt" link on the Payments page.
// The receipt itself is ReceiptSheet (narrow, like a shop receipt). Under it
// is "Download receipt (PDF)" (paid payments only): a real PDF made on the
// server by ./pdf/route.ts, named Block69-Receipt-<receipt no>.pdf. People
// who want paper print that PDF.
//
// ONLY THE PAYMENT'S OWNER: requireClient() checks the login, and
// get_my_payments(id) (migration 8) gives nothing back for someone else's
// payment, so they get "page not found" (the PDF route checks the same way).
// Money: the amounts are the ones SAVED on the booking and payment
// (book_seat() worked them out from settings). Nothing is recalculated here.
// No card or bank numbers are ever stored, so none can show here.

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { DownloadReceiptButton } from "@/components/receipt/DownloadReceiptButton";
import { ReceiptSheet } from "@/components/receipt/ReceiptSheet";
import { requireClient } from "@/lib/auth/user";
import { getMyPayment } from "@/lib/data/account";
import { getPublicSettings } from "@/lib/data/settings";
import { clientReceiptData } from "@/lib/receipt";
import { isUuid } from "@/lib/validation";
import type { MyPayment } from "@/types/app";

export const metadata = { title: "Receipt" };

// The receipt page.
// Takes: params (the payment id from the address).
// Gives back: a back link, then the receipt inside <Suspense>.
export default function ReceiptPage({ params }: PageProps<"/account/payments/[paymentId]">) {
  return (
    <>
      <Link
        href="/account/payments"
        className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-brown print:hidden"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Payments
      </Link>
      <Suspense fallback={<AccountLoading label="your receipt" cards={1} />}>
        <Receipt params={params} />
      </Suspense>
    </>
  );
}

// Loads the payment and draws the receipt.
// Takes: the params promise.
// Gives back: the receipt sheet and the Download (PDF) button.
async function Receipt({ params }: { params: PageProps<"/account/payments/[paymentId]">["params"] }) {
  const { paymentId } = await params;
  if (!isUuid(paymentId)) notFound();
  const user = await requireClient(`/account/payments/${paymentId}`);

  let payment: MyPayment | null;
  let settings;
  try {
    [payment, settings] = await Promise.all([getMyPayment(paymentId), getPublicSettings()]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="your receipt" />;
  }
  if (!payment) notFound();

  const receipt = clientReceiptData(
    payment,
    { name: user.fullName, email: user.email },
    { name: settings.cafeName, address: settings.cafeAddress, email: settings.cafeEmail },
  );

  return (
    <div className="flex flex-col gap-4">
      <ReceiptSheet data={receipt} />
      <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:justify-center print:hidden">
        {payment.status === "paid" ? (
          <DownloadReceiptButton href={`/account/payments/${payment.payment_id}/pdf`} />
        ) : (
          <p className="text-sm text-muted">A PDF receipt is available once this payment is paid.</p>
        )}
      </div>
    </div>
  );
}

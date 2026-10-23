// My Vouchers: /account/vouchers
// Where it's used: the account menu, and "See my vouchers" after cancelling
// 12 to 24 hours before class.
// Layout follows docs/designs/Vouchers.html: one card per code, with the
// discount on the left and the code (with a Copy button) on the right.
//
// ONLY THE PERSON'S OWN PERSONAL CODES: get_my_vouchers() (migration 8)
// lists vouchers whose owner is the caller. Promo codes (like WELCOME10) and
// other people's codes are never listed.
// LIVE DATA: loaded on every visit, never cached (a code can be used up or
// held by an unpaid booking at any moment).

import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AccountHeading, AccountLoadError, AccountLoading } from "@/components/account/AccountHeading";
import { VoucherCode } from "@/components/account/VoucherCode";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireClient } from "@/lib/auth/user";
import { voucherDiscount, voucherStateBadge } from "@/lib/booking-rules";
import { cn } from "@/lib/cn";
import { getMyVouchers } from "@/lib/data/account";
import { getPublicSettings, type PublicSettings } from "@/lib/data/settings";
import { formatClassDate, formatManilaDate, formatPeso } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { MyVoucher } from "@/types/app";

export const metadata = { title: "My Vouchers" };

// The My Vouchers page.
// Takes: nothing.
// Gives back: the heading, then the live list inside <Suspense>.
export default function VouchersPage() {
  return (
    <>
      <AccountHeading
        title="My Vouchers"
        intro="Codes you can use on your next booking. They take money off the class fee only."
      />
      <Suspense fallback={<AccountLoading label="your vouchers" />}>
        <VoucherList />
      </Suspense>
    </>
  );
}

// The live part: one card per voucher, valid ones first.
// Takes: nothing.
// Gives back: the cards (or a "no vouchers" card) and the small print.
async function VoucherList() {
  await requireClient("/account/vouchers");

  let vouchers: MyVoucher[];
  let settings: PublicSettings;
  try {
    [vouchers, settings] = await Promise.all([getMyVouchers(), getPublicSettings()]);
  } catch (error) {
    unstable_rethrow(error); // pass on Next.js's own signals
    console.error(error);
    return <AccountLoadError what="your vouchers" />;
  }

  // Read the clock once, for "54 days left" (we're in a real visit)
  const nowMs = nowForThisVisit();

  return (
    <div className="flex flex-col gap-4">
      {vouchers.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            You don&apos;t have any vouchers. If you cancel a class 12 to 24 hours before it starts, you get a 50%
            code, and it shows here.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {vouchers.map((voucher) => (
            <VoucherCard key={voucher.voucher_id} voucher={voucher} settings={settings} nowMs={nowMs} />
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Cancellation codes are personal, valid for 60 days, and work for one booking. Mat rental is never discounted,
        so the full {formatPeso(settings.matPrice)} still goes to the strays.
      </p>
    </div>
  );
}

// One voucher card (".v" in docs/designs/Vouchers.html).
// Takes: the voucher, the settings (for "your next class costs ..."), and now.
// Gives back: an <li> with the card. Used and expired codes are faded.
function VoucherCard({ voucher, settings, nowMs }: { voucher: MyVoucher; settings: PublicSettings; nowMs: number }) {
  const badge = voucherStateBadge(voucher.state);
  const usable = voucher.state === "active";
  // "50%" or "₱100"
  const big = voucher.percent_off !== null ? `${Number(voucher.percent_off)}%` : formatPeso(Number(voucher.amount_off));

  return (
    <li>
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-[20px] border border-line bg-card sm:flex-row lg:rounded-3xl",
          !usable && "opacity-70",
        )}
      >
        {/* Left: the discount, big */}
        <div className="flex flex-row items-baseline justify-center gap-2 bg-tan-soft px-6 py-4 sm:w-44 sm:flex-col sm:items-center sm:justify-center sm:gap-1">
          <span className="font-heading text-3xl font-semibold text-brown">{big} off</span>
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brown">Class fee</span>
        </div>

        {/* Right: where it's from, its state, what it means, and the code */}
        <div className="flex flex-1 flex-col gap-2 p-5 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-base font-semibold text-brown">
              {voucher.source === "cancellation" ? "From a cancellation" : "Personal code"}
            </h2>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-sm leading-relaxed text-muted">{voucherSentence(voucher, settings, nowMs)}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <VoucherCode code={voucher.code} usable={usable} />
            {usable && (
              <ButtonLink href="/book" className="sm:shrink-0">
                Use on next booking
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// Explains one voucher in a sentence.
// Takes: the voucher, the settings (prices) and now.
// Gives back: e.g. "Your next class costs ₱250, or ₱300 with a mat. Expires
// December 22, 2026 (54 days left)."
function voucherSentence(voucher: MyVoucher, settings: PublicSettings, nowMs: number): string {
  switch (voucher.state) {
    case "active": {
      // The price with this code (the same sum the database uses)
      const discount = voucherDiscount(settings.classPrice, voucher.percent_off, voucher.amount_off);
      const price = settings.classPrice - discount;
      const priceText = `Your next class costs ${formatPeso(price)}, or ${formatPeso(price + settings.matPrice)} with a mat.`;
      if (!voucher.expires_at) return priceText;
      const daysLeft = Math.max(0, Math.ceil((new Date(voucher.expires_at).getTime() - nowMs) / 86_400_000));
      return `${priceText} Expires ${formatManilaDate(voucher.expires_at)} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).`;
    }
    case "reserved":
      return "It's on a booking that's waiting for payment. If that seat hold runs out, the code comes back here.";
    case "used":
      return voucher.used_for_date
        ? `Used for your class on ${formatClassDate(voucher.used_for_date).full}.`
        : "This code has been used.";
    case "expired":
      return voucher.expires_at ? `Expired on ${formatManilaDate(voucher.expires_at)}.` : "This code has expired.";
  }
}

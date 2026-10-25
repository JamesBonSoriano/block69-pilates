// Admin Pricing & Vouchers: /admin/pricing
// Where it's used: the admin menu ("Pricing & Vouchers").
// Layout follows docs/designs/AdminPricing.html: a Prices card and a
// "Create a promo code" card side by side (one column on phones), then the
// promo code list and the system's 50% codes (read-only).
//
// What it saves (through src/lib/admin/setup-actions.ts):
//   - class price, mat price, seat hold minutes, booking cutoff
//     -> saveSettings() -> admin_update_settings (checks every value)
//   - a new promo code -> createPromo() -> admin_create_promo
//   - turn a promo code off / on -> setPromoEnabled() -> admin_set_promo_enabled
// A new price only changes NEW bookings: every booking keeps the fees it was
// made with (bookings.class_fee / mat_fee).
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks.

import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { ConfirmActionButton } from "@/components/admin/ConfirmActionButton";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { createPromo, saveSettings, setPromoEnabled } from "@/lib/admin/setup-actions";
import { requireAdmin } from "@/lib/auth/user";
import { voucherLabel } from "@/lib/booking-rules";
import { getAdminVouchers, getAllSettings } from "@/lib/data/admin-setup";
import { formatClassDate, formatManilaDate, manilaDateString } from "@/lib/format";
import { nowForThisVisit } from "@/lib/server-clock";
import type { AdminVoucher, AdminVoucherState } from "@/types/app";
import type { Json } from "@/types/database";

export const metadata: Metadata = { title: "Pricing & Vouchers · Admin" };

// The Pricing & Vouchers page.
// Takes: nothing. Gives back: the heading, then the live part in <Suspense>.
export default function AdminPricingPage() {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Pricing & Vouchers"
        intro="Prices here feed the booking page, the Home page and every total. Nothing is typed into page text."
      />
      <Suspense fallback={<AdminLoading label="prices and vouchers" />}>
        <PricingBody />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the two forms and the two lists.
// Takes: nothing. Gives back: the cards.
async function PricingBody() {
  await requireAdmin();

  let settings: Record<string, Json>;
  let vouchers: AdminVoucher[];
  try {
    [settings, vouchers] = await Promise.all([getAllSettings(), getAdminVouchers()]);
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the prices and vouchers" />;
  }

  // The earliest last day a new promo code may have: today (Manila)
  const today = manilaDateString(nowForThisVisit());
  const promos = vouchers.filter((voucher) => voucher.source === "promo");
  const personal = vouchers.filter((voucher) => voucher.source === "cancellation");

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        {/* ---- Prices and booking rules ---- */}
        <AdminCard>
          <AdminActionForm
            action={saveSettings}
            submitLabel="Save prices"
            footerNote="New prices apply to new bookings only. Bookings already made keep the price they were made with."
          >
            <input type="hidden" name="form" value="pricing" />
            <h2 className="text-base font-semibold">Prices</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Class price (per seat, ₱)"
                name="class_price"
                type="number"
                inputMode="decimal"
                min={1}
                max={100000}
                step="0.01"
                required
                defaultValue={numberText(settings.class_price)}
              />
              <Input
                label="Mat rental add-on (₱)"
                name="mat_price"
                type="number"
                inputMode="decimal"
                min={0}
                max={100000}
                step="0.01"
                required
                defaultValue={numberText(settings.mat_price)}
              />
            </div>
            <p className="rounded-xl bg-admin-bg px-3.5 py-3 text-xs leading-relaxed text-muted">
              The class price includes the upsized matcha or coffee. Mat rental is donated in full to feed stray
              animals, so vouchers never discount it.
            </p>

            <h2 className="pt-2 text-base font-semibold">Booking rules</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Seat hold while paying (minutes)"
                name="hold_minutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={60}
                step={1}
                required
                hint="5 to 60. The PayMongo checkout ends at the same time."
                defaultValue={numberText(settings.hold_minutes)}
              />
              <Input
                label="Online booking closes on class day at"
                name="cutoff_time"
                type="time"
                required
                hint="Philippine time. Walk-ins can still be added after it."
                defaultValue={typeof settings.cutoff_time === "string" ? settings.cutoff_time : "08:00"}
              />
            </div>
          </AdminActionForm>
        </AdminCard>

        {/* ---- Create a promo code ---- */}
        <AdminCard>
          <AdminActionForm action={createPromo} submitLabel="Create code" pendingLabel="Creating…" resetOnSave>
            <h2 className="text-base font-semibold">Create a promo code</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Code"
                name="code"
                required
                maxLength={32}
                pattern="[A-Za-z0-9\-]{3,32}"
                placeholder="FIRSTMAT20"
                autoComplete="off"
                hint="3 to 32 letters, numbers or dashes. Saved in capitals."
                className="sm:col-span-2"
              />
              <Input
                label="Percent off the class fee"
                name="percent_off"
                type="number"
                inputMode="decimal"
                min={1}
                max={100}
                step="0.01"
                required
                placeholder="20"
              />
              <Input
                label="Total uses"
                name="uses"
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                step={1}
                required
                placeholder="30"
              />
              <Input
                label="Last day it works"
                name="expires_on"
                type="date"
                min={today}
                hint="Leave empty for no end date. It works until midnight that day."
                className="sm:col-span-2"
              />
            </div>
            <p className="text-xs text-muted">
              Promo codes only take money off the class fee, never the mat rental. Codes starting with HALF- are kept
              for the system&apos;s 50% codes.
            </p>
          </AdminActionForm>
        </AdminCard>
      </div>

      {/* ---- Promo codes ---- */}
      <AdminCard className="p-0 lg:p-0">
        <div className="flex flex-col gap-1 border-b border-admin-line px-4 py-4 sm:flex-row sm:items-baseline sm:justify-between lg:px-5">
          <h2 className="text-base font-semibold">Promo codes</h2>
          <p className="text-xs text-muted">Codes the cafe creates for promos</p>
        </div>
        {promos.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted lg:px-5">No promo codes yet. Create one above.</p>
        ) : (
          <ul className="divide-y divide-admin-bg">
            {promos.map((promo) => (
              <PromoRow key={promo.voucher_id} promo={promo} />
            ))}
          </ul>
        )}
      </AdminCard>

      {/* ---- The system's 50% codes (read-only) ---- */}
      <AdminCard className="p-0 lg:p-0">
        <div className="flex flex-col gap-1 border-b border-admin-line px-4 py-4 sm:flex-row sm:items-baseline sm:justify-between lg:px-5">
          <h2 className="text-base font-semibold">50% codes issued by the system</h2>
          <p className="text-xs text-muted">
            Made when a booking is cancelled 12 to 24 hours before class · valid 60 days · one use
          </p>
        </div>
        {personal.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted lg:px-5">No 50% codes have been issued yet.</p>
        ) : (
          <>
          {/* ===== Tablet and laptop: table ===== */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">50% codes issued by the system</caption>
              <thead>
                <tr className="border-b border-admin-line text-left text-[11px] uppercase tracking-[0.06em] text-muted">
                  <th scope="col" className="px-4 py-3 font-semibold lg:px-5">Code</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Client</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Issued</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Expires</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {personal.map((code) => {
                  const badge = adminVoucherBadge(code.state, code.used_for_date);
                  return (
                    <tr key={code.voucher_id} className="border-b border-admin-bg last:border-b-0">
                      <td className="px-4 py-3 font-semibold lg:px-5">{code.code}</td>
                      <td className="px-4 py-3">
                        {code.owner_name ?? code.owner_email ?? "Client"}
                        {code.owner_name && code.owner_email && (
                          <span className="block text-[11px] text-muted">{code.owner_email}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{formatManilaDate(code.created_at)}</td>
                      <td className="px-4 py-3">{code.expires_at ? formatManilaDate(code.expires_at) : "Never"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ===== Phone: one small card per code (nothing wider than the screen) ===== */}
          <ul className="flex flex-col divide-y divide-admin-bg md:hidden">
            {personal.map((code) => {
              const badge = adminVoucherBadge(code.state, code.used_for_date);
              return (
                <li key={code.voucher_id} className="flex flex-col gap-1 px-4 py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{code.code}</span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <p className="break-all text-xs text-muted">{code.owner_name ?? code.owner_email ?? "Client"}</p>
                  <p className="text-xs text-muted">
                    Issued {formatManilaDate(code.created_at)} · expires{" "}
                    {code.expires_at ? formatManilaDate(code.expires_at) : "never"}
                  </p>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </AdminCard>
    </>
  );
}

// One promo code row: code, discount, uses, last day, status and the
// Turn off / Turn on button. It's a list item (not a table row) so it
// stacks nicely on phones and sits in one line on laptops.
// Takes: the promo code. Gives back: an <li>.
function PromoRow({ promo }: { promo: AdminVoucher }) {
  const badge = adminVoucherBadge(promo.state, null);
  const total = promo.times_used + promo.uses_left;
  const isOff = promo.state === "off";

  return (
    <li className="grid grid-cols-1 gap-2 px-4 py-3.5 text-[13px] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center lg:px-5">
      <div className="flex items-center justify-between gap-2 sm:block">
        <span className="font-semibold">{promo.code}</span>
        <Badge variant={badge.variant} className="sm:hidden">
          {badge.label}
        </Badge>
      </div>
      <span className="text-muted sm:text-ink">{voucherLabel(promo.percent_off, promo.amount_off)}</span>
      <span>
        Used {promo.times_used} of {total}
        {promo.reserved > 0 && <span className="block text-[11px] text-muted">{promo.reserved} on unpaid bookings</span>}
      </span>
      <span>
        {/* Works until midnight after the last day, so show the day before that moment */}
        {promo.expires_at ? `Until ${formatManilaDate(new Date(new Date(promo.expires_at).getTime() - 1000))}` : "No end date"}
      </span>
      <div className="flex items-center gap-3 sm:justify-end">
        <Badge variant={badge.variant} className="hidden sm:inline-flex">
          {badge.label}
        </Badge>
        <ConfirmActionButton
          action={setPromoEnabled}
          fields={{ voucher_id: promo.voucher_id, enabled: isOff ? "true" : "false" }}
          label={isOff ? "Turn on" : "Turn off"}
          srLabel={` code ${promo.code}`}
          variant={isOff ? "secondary" : "danger"}
          confirm={
            isOff
              ? undefined
              : {
                  title: `Turn off ${promo.code}?`,
                  body: "Nobody will be able to use this code from now on. Bookings that already used it keep their discount. You can turn it back on later.",
                  confirmLabel: "Turn off the code",
                }
          }
        />
      </div>
    </li>
  );
}

// Picks the admin's badge for a voucher.
// Takes: the voucher's state, and for a used personal code the date of the
// class it was used on.
// Gives back: the badge text and color.
function adminVoucherBadge(state: AdminVoucherState, usedForDate: string | null): { label: string; variant: BadgeVariant } {
  switch (state) {
    case "active":
      return { label: "Active", variant: "success" };
    case "reserved":
      return { label: "On an unpaid booking", variant: "warning" };
    case "used":
      return { label: usedForDate ? `Used ${formatClassDate(usedForDate).short}` : "Used up", variant: "neutral" };
    case "expired":
      return { label: "Expired", variant: "error" };
    case "off":
      return { label: "Turned off", variant: "neutral" };
  }
}

// Turns a number setting into the text for a number box.
// Takes: the saved value. Gives back: e.g. "500", or "" if it isn't a number.
function numberText(value: Json | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

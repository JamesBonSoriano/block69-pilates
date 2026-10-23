// Admin Settings: /admin/settings
// Where it's used: the admin menu ("Settings").
// Layout follows docs/designs/AdminSettings.html: two columns of cards on
// laptops (one column on phones): cafe details, links, drink options on the
// left; payments (manual transfer switch, GCash and BPI details) and alerts
// on the right. One "Save changes" button saves everything together.
//
// PLACEHOLDERS: values still written in [SQUARE BRACKETS] (e.g. [GCASH
// NUMBER], from migration 4) are listed in a yellow box at the top, each
// with a link to its field, and the field says "Still a placeholder".
//
// Saving: saveSettings() (src/lib/admin/setup-actions.ts) ->
// admin_update_settings, which checks every value (emails, https:// links,
// 1 to 12 drinks, ...) and saves all or nothing. It then clears the cached
// public settings, so the header, footer, About Us and the booking pages
// show the change at once.
// Prices, the seat hold and the cutoff are on Pricing & Vouchers; seats per
// class are on Schedule.
//
// LIVE DATA, never cached. Protection: proxy + requireAdmin() + the
// database's own admin checks.

import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminCard, AdminLoadError, AdminLoading, AdminPage, AdminPageHeader } from "@/components/admin/AdminUi";
import { DrinkOptionsField } from "@/components/admin/DrinkOptionsField";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { saveSettings } from "@/lib/admin/setup-actions";
import { requireAdmin } from "@/lib/auth/user";
import { getAllSettings } from "@/lib/data/admin-setup";
import type { Json } from "@/types/database";

export const metadata: Metadata = { title: "Settings · Admin" };

// The id of the settings form (the header's Save button sends it too).
const FORM_ID = "settings-form";

// Every text setting on this page: its key, label, field type and help text.
// The key is also the field's name and id (so the placeholder links work).
type TextField = {
  key: string;
  label: string;
  type?: "text" | "email" | "url" | "tel";
  hint?: string;
  required?: boolean;
  wide?: boolean; // takes the whole row on laptops
};

const CAFE_FIELDS: TextField[] = [
  { key: "cafe_name", label: "Business name", required: true, wide: true },
  { key: "cafe_address", label: "Address", required: true, wide: true },
  { key: "cafe_email", label: "Contact email", type: "email", required: true },
  { key: "cafe_phone", label: "Contact number", type: "tel", hint: "Shown on About Us, e.g. 0917 123 4567" },
  { key: "maps_url", label: "Google Maps link", type: "url", hint: "Starts with https://", wide: true },
];

const LINK_FIELDS: TextField[] = [
  { key: "chat_url", label: "Chat With Us link", type: "url", hint: "Messenger (https://m.me/...) or Instagram. Empty hides the button.", wide: true },
  { key: "instagram_url", label: "Instagram link", type: "url", hint: "e.g. https://www.instagram.com/block69cafe" },
  { key: "facebook_url", label: "Facebook link", type: "url", hint: "e.g. https://www.facebook.com/block69cafe" },
];

const PAYMENT_FIELDS: TextField[] = [
  { key: "gcash_name", label: "GCash account name" },
  { key: "gcash_number", label: "GCash number", type: "tel" },
  { key: "bpi_account_name", label: "BPI account name" },
  { key: "bpi_account_number", label: "BPI account number" },
];

const ALERT_FIELDS: TextField[] = [
  {
    key: "admin_alert_email",
    label: "Alert email (admins only)",
    type: "email",
    required: true,
    hint: "Where late payments and screenshots to check will be emailed (emails come in a later step). Never shown on the website.",
    wide: true,
  },
];

// The Settings page.
// Takes: nothing. Gives back: the heading, then the live form in <Suspense>.
export default function AdminSettingsPage() {
  return (
    <AdminPage>
      <AdminPageHeader
        overline="Mat Pilates admin"
        title="Settings"
        intro="Cafe details, links and payment details the website shows."
        actions={
          // Sends the form below (form="settings-form"), so it can sit up here
          <Button type="submit" form={FORM_ID}>
            Save changes
          </Button>
        }
      />
      <Suspense fallback={<AdminLoading label="the settings" />}>
        <SettingsBody />
      </Suspense>
    </AdminPage>
  );
}

// The live part: the placeholder box and the form.
// Takes: nothing. Gives back: the cards.
async function SettingsBody() {
  await requireAdmin();

  let settings: Record<string, Json>;
  try {
    settings = await getAllSettings();
  } catch (error) {
    unstable_rethrow(error);
    console.error(error);
    return <AdminLoadError what="the settings" />;
  }

  // Which text settings still hold a [PLACEHOLDER]
  const allFields = [...CAFE_FIELDS, ...LINK_FIELDS, ...PAYMENT_FIELDS, ...ALERT_FIELDS];
  const placeholders = allFields.filter((field) => isPlaceholder(text(settings, field.key)));
  const drinks = Array.isArray(settings.drink_options)
    ? settings.drink_options.filter((drink): drink is string => typeof drink === "string")
    : [];

  // Draws one text field, with a warning when it's still a placeholder.
  // Takes: the field. Gives back: an Input.
  const field = (item: TextField) => {
    const value = text(settings, item.key);
    return (
      <Input
        key={item.key}
        label={item.label}
        name={item.key}
        type={item.type ?? "text"}
        defaultValue={value}
        required={item.required}
        maxLength={item.key === "cafe_address" ? 200 : item.type === "url" ? 300 : 80}
        hint={isPlaceholder(value) ? "Still a placeholder: please type the real value." : item.hint}
        className={item.wide ? "sm:col-span-2" : undefined}
      />
    );
  };

  return (
    <>
      {placeholders.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-warning-bg px-4 py-3.5 text-sm leading-relaxed text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">
              {placeholders.length} setting{placeholders.length === 1 ? " is" : "s are"} still a placeholder
            </p>
            <p>
              These show on the website as a dashed box until they&apos;re filled in:{" "}
              {placeholders.map((item, n) => (
                <span key={item.key}>
                  {n > 0 && ", "}
                  <a href={`#${item.key}`} className="underline underline-offset-2">
                    {item.label}
                  </a>
                </span>
              ))}
              . Page text placeholders (like the instructor&apos;s name) are on{" "}
              <Link href="/admin/content" className="underline underline-offset-2">
                Content
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <AdminActionForm id={FORM_ID} action={saveSettings} submitLabel="Save changes" footerNote="Everything on this page is saved together.">
        <input type="hidden" name="form" value="settings" />
        <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-5">
            {/* ---- Cafe details ---- */}
            <AdminCard className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">Cafe information</h2>
              <div className="grid gap-4 sm:grid-cols-2">{CAFE_FIELDS.map(field)}</div>
            </AdminCard>

            {/* ---- Links ---- */}
            <AdminCard className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">Social links and Chat With Us</h2>
              <div className="grid gap-4 sm:grid-cols-2">{LINK_FIELDS.map(field)}</div>
            </AdminCard>

            {/* ---- Drinks ---- */}
            <AdminCard className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">Drink options</h2>
              <p className="text-xs text-muted">
                Guests pick one upsized drink when they book (and walk-ins at the counter). It shows on the attendance
                list.
              </p>
              <DrinkOptionsField initial={drinks} />
            </AdminCard>
          </div>

          <div className="flex flex-col gap-5">
            {/* ---- Payments ---- */}
            <AdminCard className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">Payments</h2>
              <div className="flex items-start gap-3 border-b border-admin-bg pb-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold">PayMongo (GCash, Maya, card)</p>
                  <p className="text-xs text-muted">The main way to pay. Confirms bookings on its own once PayMongo says they are paid.</p>
                </div>
                <Badge variant="warning">Test mode</Badge>
              </div>
              <Checkbox
                name="manual_payment_enabled"
                defaultChecked={settings.manual_payment_enabled === true}
                label={
                  <>
                    <span className="block font-semibold">Manual transfer backup</span>
                    <span className="block text-xs text-muted">
                      Shows the GCash / BPI details below and a screenshot upload on the pay page. You check each one
                      in Payments.
                    </span>
                  </>
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">{PAYMENT_FIELDS.map(field)}</div>
              <p className="text-xs text-muted">
                These are the CAFE&apos;s own accounts, shown so clients can pay you. Clients&apos; card or bank numbers
                are never stored.
              </p>
            </AdminCard>

            {/* ---- Alerts ---- */}
            <AdminCard className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">Alerts</h2>
              <div className="grid gap-4 sm:grid-cols-2">{ALERT_FIELDS.map(field)}</div>
            </AdminCard>

            {/* ---- Where the other rules live ---- */}
            <AdminCard className="flex flex-col gap-2 text-sm">
              <h2 className="text-base font-semibold">Booking rules</h2>
              <p className="text-muted">
                Prices, the seat hold and the online cutoff are on{" "}
                <Link href="/admin/pricing" className="font-semibold text-brown underline underline-offset-2">
                  Pricing &amp; Vouchers
                </Link>
                . Class days, times and seats are on{" "}
                <Link href="/admin/schedule" className="font-semibold text-brown underline underline-offset-2">
                  Schedule
                </Link>
                .
              </p>
              <p className="rounded-xl bg-admin-bg px-3.5 py-3 text-xs leading-relaxed text-muted">
                Cancellation policy (set by the database, the same for everyone): more than 24 hours before, one free
                transfer. 12 to 24 hours before, a 50% code. Less than 12 hours or no-show, forfeited. No cash refunds.
              </p>
            </AdminCard>
          </div>
        </div>
      </AdminActionForm>
    </>
  );
}

// Reads one setting as text.
// Takes: the settings and a key. Gives back: the text, or "".
function text(settings: Record<string, Json>, key: string): string {
  const value = settings[key];
  return typeof value === "string" ? value : "";
}

// Checks if a value is still a [PLACEHOLDER] from migration 4.
// Takes: the text. Gives back: true if it has words in [square brackets].
function isPlaceholder(value: string): boolean {
  return /\[[^\]]+\]/.test(value);
}

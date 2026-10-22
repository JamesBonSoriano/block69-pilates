// A placeholder for the admin pages that come in Step 11 part 2 (Payments,
// Pricing & Vouchers, Settings), so the menu links already work.
// Where it's used: src/app/admin/payments/, pricing/ and settings/ page.tsx.
// Each of those pages checks requireAdmin() first.

import { Construction } from "lucide-react";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { requireAdmin } from "@/lib/auth/user";
import { AdminCard, AdminLoading, AdminPage, AdminPageHeader } from "./AdminUi";

// The placeholder page.
// Takes: the page title and a list of what the page will do.
// Gives back: the placeholder, shown only after the admin check (inside
// <Suspense>, because the check reads the login cookies).
export function ComingSoon({ title, plans }: { title: string; plans: string[] }) {
  return (
    <Suspense fallback={<AdminPage><AdminLoading label={title} blocks={1} /></AdminPage>}>
      <ComingSoonBody title={title} plans={plans} />
    </Suspense>
  );
}

// The placeholder's content, for active admins only.
// Takes: the title and plans. Gives back: a heading and a white card.
async function ComingSoonBody({ title, plans }: { title: string; plans: string[] }) {
  await requireAdmin();
  return (
    <AdminPage>
      <AdminPageHeader overline="Coming in Step 11 part 2" title={title} />
      <AdminCard className="flex flex-col items-start gap-4">
        <Construction aria-hidden="true" className="size-7 text-brown" />
        <p className="text-sm">This page is being built next. It will let you:</p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
          {plans.map((plan) => (
            <li key={plan}>{plan}</li>
          ))}
        </ul>
        <ButtonLink href="/admin" variant="secondary">
          Back to the Dashboard
        </ButtonLink>
      </AdminCard>
    </AdminPage>
  );
}

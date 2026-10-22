// Admin Payments: /admin/payments (a placeholder until Step 11 part 2)
// Where it's used: the admin menu ("Payments").
// Protection: proxy + requireAdmin() inside ComingSoon.

import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Payments · Admin" };

// The placeholder page.
// Takes: nothing. Gives back: the "coming next" card.
export default function AdminPaymentsPage() {
  return (
    <ComingSoon
      title="Payments"
      plans={[
        "See every payment with filters (status, method, date)",
        "Check GCash / BPI transfer screenshots and approve or reject them",
        "See late payments (paid after the seat hold ended) clearly",
      ]}
    />
  );
}

// Admin Pricing & Vouchers: /admin/pricing (a placeholder until Step 11 part 2)
// Where it's used: the admin menu ("Pricing & Vouchers").
// Protection: proxy + requireAdmin() inside ComingSoon.

import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Pricing & Vouchers · Admin" };

// The placeholder page.
// Takes: nothing. Gives back: the "coming next" card.
export default function AdminPricingPage() {
  return (
    <ComingSoon
      title="Pricing & Vouchers"
      plans={[
        "Change the class price, mat price, seat hold minutes and booking cutoff",
        "Create and turn off promo codes",
        "See the personal 50% vouchers the system has given",
      ]}
    />
  );
}

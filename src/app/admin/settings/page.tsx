// Admin Settings: /admin/settings (a placeholder until Step 11 part 2)
// Where it's used: the admin menu ("Settings").
// Protection: proxy + requireAdmin() inside ComingSoon.

import type { Metadata } from "next";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const metadata: Metadata = { title: "Settings · Admin" };

// The placeholder page.
// Takes: nothing. Gives back: the "coming next" card.
export default function AdminSettingsPage() {
  return (
    <ComingSoon
      title="Settings"
      plans={[
        "Edit the cafe details, links, and GCash / BPI details",
        "Turn the manual transfer backup on or off",
        "Edit the weekly schedule, page text and photos, and manage users",
      ]}
    />
  );
}

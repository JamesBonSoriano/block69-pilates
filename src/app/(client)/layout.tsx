// The layout for all CLIENT pages: Header on top, the page, Footer below.
// Where it's used: Next.js wraps every page inside src/app/(client)/ with it
// (Home and My Account now; About Us and booking later).
// "(client)" in brackets is a "route group": it groups files without adding
// "/client" to the web address, so the Home page is still "/".

import { BookingPolicies } from "@/components/booking/PolicyDialog";
import { NumberedList, Paragraphs } from "@/components/content/ContentText";
import { fillSettings, socialLinks } from "@/lib/content-text";
import { getPageContent } from "@/lib/data/content";
import { getPublicSettings } from "@/lib/data/settings";
import { SiteShell } from "@/components/layout/SiteShell";

// The client page frame.
// Takes: `children`, the page being shown.
// Gives back: the page inside the shared frame (skip link, header, footer).
export default async function ClientLayout({ children }: LayoutProps<"/">) {
  // Use the same editable sections and settings as the direct Policies page.
  const [content, settings] = await Promise.all([getPageContent("booking"), getPublicSettings()]);
  const policy = content.cancellation_policy;
  const agreement = content.agreement;
  return (
    <SiteShell>
      <BookingPolicies sections={{
        cancellation: policy && {
          title: fillSettings(policy.title, settings) || "Cancellation policy",
          body: <NumberedList text={fillSettings(policy.body, settings)} />,
        },
        agreement: agreement && {
          title: fillSettings(agreement.title, settings) || "Registration Agreement",
          body: <div className="flex flex-col gap-3">
            <Paragraphs
              text={fillSettings(agreement.body, settings, { keepLinks: true })}
              links={socialLinks(settings)}
              className="text-sm leading-relaxed"
            />
          </div>,
        },
      }}>
        {children}
      </BookingPolicies>
    </SiteShell>
  );
}

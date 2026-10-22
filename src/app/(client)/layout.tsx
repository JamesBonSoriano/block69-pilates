// The layout for all CLIENT pages: Header on top, the page, Footer below.
// Where it's used: Next.js wraps every page inside src/app/(client)/ with it
// (Home and My Account now; About Us and booking later).
// "(client)" in brackets is a "route group": it groups files without adding
// "/client" to the web address, so the Home page is still "/".

import { SiteShell } from "@/components/layout/SiteShell";

// The client page frame.
// Takes: `children`, the page being shown.
// Gives back: the page inside the shared frame (skip link, header, footer).
export default function ClientLayout({ children }: LayoutProps<"/">) {
  return <SiteShell>{children}</SiteShell>;
}

// The layout for the login pages: /login, /signup, /forgot-password,
// /reset-password and /reactivate ("Welcome back!", Version 1.4).
// Where it's used: Next.js wraps every page inside src/app/(auth)/ with it.
// "(auth)" is a route group: it keeps these files together without adding
// "/auth" to their web addresses. They use the same header and footer as the
// client pages (docs/designs/PhoneLogin.html).

import { SiteShell } from "@/components/layout/SiteShell";

// The login pages' frame.
// Takes: `children`, the page being shown.
// Gives back: the page inside the shared frame (skip link, header, footer).
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return <SiteShell>{children}</SiteShell>;
}

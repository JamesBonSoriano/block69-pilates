// The Next.js "proxy": code that runs BEFORE every page request.
// (Next.js 16 renamed this file from middleware.ts to proxy.ts. It must sit in
// src/, next to the app/ folder.)
// Where it's used: Next.js finds and runs it automatically.
//
// Right now it only keeps the visitor's Supabase login fresh.
// Step 7 adds route protection (guests can't open My Account, only admins can
// open /admin). Admin pages will still check the role again on the server.

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Runs for each matching request.
// Takes: the incoming request.
// Gives back: the response to continue with (with refreshed login cookies).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Which requests the proxy runs for: everything EXCEPT Next.js's own files
// and images, which never need a login check (this keeps the site fast).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

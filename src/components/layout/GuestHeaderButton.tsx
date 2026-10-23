"use client";
// The button a GUEST sees in the header: "Log in", except on the login and
// sign-up pages themselves, where it's "Book Now" (Change 17, Part B: a Log in
// button on the login page leads nowhere new).
// Where it's used: src/components/layout/HeaderAccount.tsx (laptop header and
// the bottom of the phone menu).
//
// "use client" = it reads the current address (usePathname). It always sits
// inside the header's <Suspense> for the login check, so that's fine.

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { loginHref } from "./nav-links";

// The pages that show "Book Now" instead of "Log in".
const AUTH_PAGES = ["/login", "/signup"];

// The guest button.
// Takes: fullWidth = stretch it (the phone menu).
// Gives back: a light pill link to /login, or to /book on the login pages.
export function GuestHeaderButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const pathname = usePathname();
  const onAuthPage = AUTH_PAGES.includes(pathname);

  return (
    <ButtonLink href={onAuthPage ? "/book" : loginHref} variant="light" fullWidth={fullWidth}>
      {onAuthPage ? "Book Now" : "Log in"}
    </ButtonLink>
  );
}

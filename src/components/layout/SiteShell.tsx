// The frame around every CLIENT-side page: skip link, Header, the page, Footer.
// Where it's used: src/app/(client)/layout.tsx (Home, About, booking, My
// Account) and src/app/(auth)/layout.tsx (log in, sign up, passwords), so
// both groups of pages look the same. Admin pages get their own frame in Step 11.

import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Header } from "./Header";

// The client page frame.
// Takes: `children`, the page being shown.
// Gives back: skip link + header + page + footer.
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Hidden until a keyboard user presses Tab: lets them jump past the nav */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-cream focus:px-4 focus:py-3 focus:text-brown"
      >
        Skip to main content
      </a>
      <Header />
      {/* flex-1 makes the page fill the screen, so the footer sits at the bottom */}
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <Footer />
    </>
  );
}

// The frame around every CLIENT-side page: skip link, Header, the page, Footer.
// Where it's used: src/app/(client)/layout.tsx (Home, About, booking, My
// Account) and src/app/(auth)/layout.tsx (log in, sign up, passwords), so
// both groups of pages look the same. The "page not found" page
// (src/app/not-found.tsx) uses it too. Admin pages get their own frame in Step 11.
// It also adds the floating "Chat With Us" button (Revisions part 1, item 2).

import { Suspense, type ReactNode } from "react";
import { getPublicSettings } from "@/lib/data/settings";
import { ChatButton, ChatButtonFallback } from "./ChatButton";
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
      <FloatingChat />
    </>
  );
}

// The floating Chat With Us button, if the cafe has set a chat link.
// Takes: nothing (reads the cached chat_url setting).
// Gives back: the button, or nothing when Settings has no chat link.
// The button reads the page address (to move above a sticky bottom bar), so
// it sits in <Suspense>; until then the same button shows in the corner.
async function FloatingChat() {
  const { chatUrl } = await getPublicSettings();
  if (!chatUrl) return null;
  return (
    <Suspense fallback={<ChatButtonFallback chatUrl={chatUrl} />}>
      <ChatButton chatUrl={chatUrl} />
    </Suspense>
  );
}

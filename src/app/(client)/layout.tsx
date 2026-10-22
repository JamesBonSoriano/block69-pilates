// The layout for all CLIENT pages: Header on top, the page, Footer below.
// Where it's used: Next.js wraps every page inside src/app/(client)/ with it
// (Home now; About Us, booking and My Account later).
// "(client)" in brackets is a "route group": it groups files without adding
// "/client" to the web address, so the Home page is still "/".

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

// The client page frame.
// Takes: `children`, the page being shown.
// Gives back: skip link + header + page + footer.
export default function ClientLayout({ children }: LayoutProps<"/">) {
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

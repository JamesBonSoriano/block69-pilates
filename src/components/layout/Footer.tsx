// The footer at the bottom of every CLIENT page: the address, contact
// details, quick links and the stray animals note.
// One column on phones, three columns on laptops.
// Where it's used: src/components/layout/SiteShell.tsx (client and login pages).
//
// Colors: the SAME background as the header bar (bg-primary = sage-dark
// #5F735D on the client side), so the top and bottom of the page match.
// (It used to be brown.) The admin side has its own frame and is not changed.
// Contrast on sage-dark (WCAG AA needs 4.5:1 for small text):
//   white #FFFFFF 5.1:1 (headings), cream #FFF9F2 4.9:1 (text, links, icons).
//   Light Sage #E8EFE6 is only 4.4:1, so it is NOT used for text here.

import { AtSign, Mail, MapPin, PawPrint } from "lucide-react";
import Link from "next/link";
import { getPageContent } from "@/lib/data/content";
import { getPublicSettings } from "@/lib/data/settings";
import { infoNavLinks, mainNavLinks } from "./nav-links";

// Class names shared by every link in the footer: cream text, at least 44px
// tall so it's easy to tap, white + underlined on hover, and a cream focus
// ring (4.9:1 on the green, well above the 3:1 a focus ring needs).
const footerLink =
  "inline-flex min-h-11 items-center gap-2 rounded-md text-cream underline-offset-4 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream";

// The client footer.
// Takes: nothing (it reads cafe details from settings and the stray animals
// note from site_content; both are cached, see src/lib/data/).
// Gives back: the <footer> element.
export async function Footer() {
  // Load both at the same time instead of one after the other
  const [settings, footerContent] = await Promise.all([
    getPublicSettings(),
    getPageContent("footer"),
  ]);
  const straysNote = footerContent.strays_note?.body;

  return (
    // print:hidden = left out when a page is printed (e.g. a payment receipt)
    // bg-primary = the header's color; text-cream for readable text (see top)
    // data-site-footer: the floating Chat With Us button (ChatButton.tsx)
    // looks for it, and moves up to stay above the footer, never on it
    <footer data-site-footer className="bg-primary text-sm text-cream print:hidden">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-3 lg:gap-12 lg:px-8 lg:py-14">
        {/* Column 1: the cafe and how to reach it */}
        <div className="flex flex-col gap-1">
          <p className="mb-2 font-heading text-base font-semibold text-white">
            {settings.cafeName} × Mat Pilates
          </p>
          {settings.cafeAddress && (
            <a
              href={settings.mapsUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={footerLink}
            >
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              {settings.cafeAddress}
            </a>
          )}
          {settings.cafeEmail && (
            <a href={`mailto:${settings.cafeEmail}`} className={footerLink}>
              <Mail aria-hidden="true" className="size-4 shrink-0" />
              {settings.cafeEmail}
            </a>
          )}
          {/* Social links (lucide has no brand logos, so we use an @ icon) */}
          <div className="flex flex-wrap gap-x-5">
            {settings.instagramUrl && (
              <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className={footerLink}>
                <AtSign aria-hidden="true" className="size-4 shrink-0" />
                Instagram
              </a>
            )}
            {settings.facebookUrl && (
              <a href={settings.facebookUrl} target="_blank" rel="noopener noreferrer" className={footerLink}>
                <AtSign aria-hidden="true" className="size-4 shrink-0" />
                Facebook
              </a>
            )}
          </div>
        </div>

        {/* Column 2: quick links (the header's pages, plus Policies) */}
        <nav aria-label="Footer">
          <p className="mb-2 font-heading text-base font-semibold text-white">Quick links</p>
          <ul className="grid grid-cols-2 gap-x-4 lg:grid-cols-1">
            {[...mainNavLinks, ...infoNavLinks].map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={footerLink}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Column 3: where the mat rental money goes (editable page text) */}
        {straysNote && (
          <div className="flex items-start gap-3">
            {/* Cream paw (sage-light would be too faint on the green) */}
            <PawPrint aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-cream" />
            <p className="leading-relaxed">{straysNote}</p>
          </div>
        )}
      </div>
    </footer>
  );
}

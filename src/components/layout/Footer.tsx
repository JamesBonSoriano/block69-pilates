// The brown footer at the bottom of every CLIENT page (CLAUDE.md section 7):
// the address, contact details, quick links and the stray animals note.
// One column on phones, three columns on laptops.
// Where it's used: src/app/(client)/layout.tsx.

import { AtSign, Mail, MapPin, PawPrint } from "lucide-react";
import Link from "next/link";
import { getPageContent } from "@/lib/data/content";
import { getPublicSettings } from "@/lib/data/settings";
import { infoNavLinks, mainNavLinks } from "./nav-links";

// Class names shared by every link in the footer: light text, at least 44px
// tall so it's easy to tap, and underlined on hover.
const footerLink =
  "inline-flex min-h-11 items-center gap-2 hover:underline focus-visible:outline-2 focus-visible:outline-cream";

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
    <footer className="bg-brown text-sm text-tan-soft print:hidden">
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
            <a href={`mailto:${settings.cafeEmail}`} className={`${footerLink} text-tan`}>
              <Mail aria-hidden="true" className="size-4 shrink-0" />
              {settings.cafeEmail}
            </a>
          )}
          {/* Social links (lucide has no brand logos, so we use an @ icon) */}
          <div className="flex flex-wrap gap-x-5 text-tan">
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
            <PawPrint aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-tan" />
            <p className="leading-relaxed">{straysNote}</p>
          </div>
        )}
      </div>
    </footer>
  );
}

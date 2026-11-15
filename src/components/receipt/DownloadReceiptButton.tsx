// The "Download receipt (PDF)" button.
// Where it's used: the client receipt (/account/payments/[paymentId]) and the
// admin receipt (/admin/receipt/[bookingId]), and (Version 1.6) the admin
// appointment view (/admin/appointments/[bookingId], "Download PDF").
// It's a plain link to the page's /pdf route, which makes the PDF on the
// server and checks who is asking (src/app/.../pdf/route.ts). "download"
// tells the browser to save the file instead of opening a new page.

import { Download } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

// The download button.
// Takes: the address of the PDF route, and optionally the button text
// (Version 1.6: the admin appointment view says "Download PDF").
// Gives back: a link that looks like the main (filled) button. It's left
// out of the printout (print:hidden).
export function DownloadReceiptButton({ href, label = "Download receipt (PDF)" }: { href: string; label?: string }) {
  return (
    <a href={href} download className={buttonClasses("primary", false, "print:hidden")}>
      <Download aria-hidden="true" className="size-4" />
      {label}
    </a>
  );
}

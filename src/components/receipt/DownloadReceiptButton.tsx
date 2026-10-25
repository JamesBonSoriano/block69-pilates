// The "Download receipt (PDF)" button.
// Where it's used: the client receipt (/account/payments/[paymentId]) and the
// admin receipt (/admin/receipt/[bookingId]).
// It's a plain link to the page's /pdf route, which makes the PDF on the
// server and checks who is asking (src/app/.../pdf/route.ts). "download"
// tells the browser to save the file instead of opening a new page.

import { Download } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

// The download button.
// Takes: the address of the PDF route.
// Gives back: a link that looks like the main (filled) button. It's left
// out of the printout (print:hidden).
export function DownloadReceiptButton({ href }: { href: string }) {
  return (
    <a href={href} download className={buttonClasses("primary", false, "print:hidden")}>
      <Download aria-hidden="true" className="size-4" />
      Download receipt (PDF)
    </a>
  );
}

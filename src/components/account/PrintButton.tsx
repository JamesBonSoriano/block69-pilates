"use client";
// A "Print" button that opens the browser's print window (where people can
// also choose "Save as PDF").
// Where it's used: the payment receipt page (/account/payments/[paymentId]).
// "use client" = printing is something only the browser can do.

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

// The print button.
// Takes: nothing.
// Gives back: a button that calls window.print(). It hides itself on the
// printed page (print:hidden).
export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden="true" className="size-4" />
      Print or save as PDF
    </Button>
  );
}

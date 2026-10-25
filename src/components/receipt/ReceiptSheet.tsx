// The receipt as it looks on screen and on paper: narrow and centred like a
// shop receipt, with dashed lines, a bold total and "Thank you" at the end.
// It shows the same ReceiptData as the PDF download (src/lib/receipt-pdf.ts).
// Where it's used: the client receipt (/account/payments/[paymentId]) and the
// admin receipt (/admin/receipt/[bookingId]).
//
// PRINTING: there's no Print button (people print the PDF), but if someone
// uses the browser's own Print (Ctrl+P), the <style> below sets
// "@page { margin: 0 }" so Chrome has no room for its date, page title, web
// address and page number. The sheet keeps its own padding instead, and loses
// its box and rounded corners on paper. The page around it hides everything
// else (print:hidden).

import { Fragment, type ReactNode } from "react";
import { formatPeso } from "@/lib/format";
import type { ReceiptData } from "@/lib/receipt-pdf";

// The print rules (only used while printing).
const PRINT_CSS = "@media print { @page { margin: 0; } html, body { background: #fff !important; } }";

// A dashed line across the receipt.
// Takes: nothing. Gives back: an <hr>.
function Dashed() {
  return <hr className="border-0 border-t border-dashed border-ink/40" />;
}

// The receipt sheet.
// Takes: the receipt data.
// Gives back: an <article> with the whole receipt.
export function ReceiptSheet({ data }: { data: ReceiptData }) {
  return (
    <article
      aria-label={`Receipt ${data.receiptNo}`}
      className="mx-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-line bg-white px-5 py-6 text-[13px] text-ink print:max-w-[80mm] print:rounded-none print:border-0 print:px-0 print:pt-[12mm]"
    >
      <style>{PRINT_CSS}</style>

      {/* ---- The cafe ---- */}
      <header className="flex flex-col items-center gap-0.5 text-center">
        <p className="font-heading text-xl font-semibold text-brown">{data.cafe.name}</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Mat Pilates + Café</p>
        {data.cafe.address && <p className="mt-1 text-xs text-muted">{data.cafe.address}</p>}
        {data.cafe.email && <p className="text-xs text-muted">{data.cafe.email}</p>}
      </header>
      <Dashed />

      {/* ---- Numbers, date, client, class ---- */}
      <h1 className="text-center font-heading text-sm font-semibold uppercase tracking-[0.12em] text-brown">
        Official receipt
      </h1>
      <dl className="flex flex-col gap-1">
        <Row label="Receipt no.">{data.receiptNo}</Row>
        <Row label="Booking no.">{data.bookingNo}</Row>
        <Row label="Date paid">{data.datePaid}</Row>
        <Row label="Client">
          {data.client.name}
          {data.client.email && <span className="block break-all text-xs text-muted">{data.client.email}</span>}
          {data.client.contact && <span className="block text-xs text-muted">{data.client.contact}</span>}
        </Row>
      </dl>
      <div>
        <p className="font-semibold">Class</p>
        {data.classLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <Dashed />

      {/* ---- Items ---- */}
      <dl className="flex flex-col gap-2">
        {data.items.map((item) => (
          <Fragment key={item.label}>
            <Row label={item.label} note={item.note}>
              {item.amount < 0 ? `−${formatPeso(-item.amount)}` : formatPeso(item.amount)}
            </Row>
          </Fragment>
        ))}
      </dl>
      <Dashed />

      {/* ---- Total, payment, status ---- */}
      <dl className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3 font-heading text-base font-bold text-brown">
          <dt>TOTAL</dt>
          <dd>{formatPeso(data.total)}</dd>
        </div>
        {data.payments.map((payment, index) => (
          <Fragment key={`${payment.method}-${index}`}>
            <Row label="Payment">
              {payment.method}
              {data.payments.length > 1 && ` (${formatPeso(payment.amount)})`}
            </Row>
            {payment.reference && (
              <Row label="Reference">
                <span className="break-all">{payment.reference}</span>
              </Row>
            )}
          </Fragment>
        ))}
        <Row label="Status">
          <span className="font-bold uppercase text-brown">{data.status}</span>
        </Row>
      </dl>
      <Dashed />

      {/* ---- Thank you ---- */}
      <footer className="flex flex-col items-center gap-0.5 text-center">
        <p className="font-heading text-base font-semibold text-brown">Thank you!</p>
        <p className="text-xs text-muted">See you on the mat at {data.cafe.name}.</p>
        <p className="text-[11px] text-muted">Card and bank details are never stored.</p>
      </footer>
    </article>
  );
}

// One "label ... value" line (inside a <dl>).
// Takes: the label, an optional grey note under it, and the value.
// Gives back: a <div> with <dt> and <dd>.
function Row({ label, note, children }: { label: string; note?: string | null; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="min-w-0 text-muted">
        <span className={note ? "text-ink" : undefined}>{label}</span>
        {note && <span className="block text-[11px] text-muted">{note}</span>}
      </dt>
      <dd className="min-w-0 max-w-[65%] text-right [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

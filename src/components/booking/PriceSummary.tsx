// The price breakdown: class fee, mat rental, voucher discount and total
// (the ".ln" rows in docs/designs/PhoneBook3.html).
// Where it's used: booking step 2 (a live preview that changes as the person
// picks a mat or applies a code) and the pay page (the real amounts saved by
// book_seat()).
// It only SHOWS numbers. The real total is always worked out by book_seat()
// in the database, never by this component.

import { cn } from "@/lib/cn";
import { formatPeso } from "@/lib/format";

type PriceSummaryProps = {
  classFee: number; // pesos, includes the upsized drink
  matFee: number; // pesos, 0 if no mat is rented
  discount: number; // pesos off the class fee, 0 if no voucher
  discountLabel?: string; // e.g. "WELCOME10 (10% off the class fee)"
  total: number; // pesos
  showTotal?: boolean; // false = leave out the Total row (when the total is shown right below anyway)
  className?: string;
};

// The price list.
// Takes: the amounts (see above), showTotal and extra classes.
// Gives back: a <dl> (a list of names and values). The mat and discount rows
// only show when they are more than 0.
export function PriceSummary({
  classFee,
  matFee,
  discount,
  discountLabel,
  total,
  showTotal = true,
  className,
}: PriceSummaryProps) {
  return (
    <dl className={cn("flex flex-col text-[13px]", className)}>
      <Row label="Class fee (includes your drink)" value={formatPeso(classFee)} />
      {matFee > 0 && <Row label="Mat rental (donated to the strays)" value={formatPeso(matFee)} />}
      {discount > 0 && (
        // Green = money saved. "−" is a real minus sign, so screen readers say "minus".
        <Row label={discountLabel ?? "Voucher (class fee only)"} value={`−${formatPeso(discount)}`} className="text-success" />
      )}
      {showTotal && (
        <Row
          label="Total"
          value={formatPeso(total)}
          className="mt-2 border-t border-line pt-2.5 text-base font-bold text-ink"
        />
      )}
    </dl>
  );
}

// One line of the price list.
// Takes: the name, the amount (already formatted) and extra classes.
// Gives back: a <div> with a <dt> on the left and a <dd> on the right.
function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex justify-between gap-4 py-1.5", className)}>
      <dt>{label}</dt>
      <dd className="whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  );
}

// The "Method" filter on the admin Earnings page (Version 1.7 Prompt C).
// The choices are exactly: All, PayMongo, GCash transfer, BPI transfer
// (Cash was removed). Each choice becomes a provider and / or a method for
// admin_list_payments (migration 26 added its p_provider filter).
// Where it's used: src/app/admin/(panel)/earnings/page.tsx. Kept in its own
// file (no "@/" imports) so tests/unit/earnings-filter.test.mjs can load it.

// The choices in the box, in order ("" = All). The value is what goes in the
// page address (?method=...).
export const EARNINGS_METHOD_OPTIONS = [
  { value: "", label: "All" },
  { value: "paymongo", label: "PayMongo" },
  { value: "gcash_transfer", label: "GCash transfer" },
  { value: "bpi_transfer", label: "BPI transfer" },
] as const;

// What each choice means in the database.
//   PayMongo        every PayMongo payment (GCash, Maya or card, online)
//   GCash transfer  a manual GCash transfer with a screenshot
//   BPI transfer    a manual BPI transfer with a screenshot
const FILTERS: Record<string, { provider?: string; method?: string }> = {
  paymongo: { provider: "paymongo" },
  gcash_transfer: { provider: "manual", method: "gcash" },
  bpi_transfer: { provider: "manual", method: "bpi" },
};

// Turns the choice from the address into the database filters.
// Takes: the ?method= value (anything; unknown values, like the old "cash",
// mean All).
// Gives back: { provider, method } (both empty = All payments).
export function earningsMethodFilter(value: string): { provider: string; method: string } {
  // hasOwn: only our 3 choices (not built-in names like "toString")
  const filter = Object.hasOwn(FILTERS, value) ? FILTERS[value] : undefined;
  return { provider: filter?.provider ?? "", method: filter?.method ?? "" };
}

// Checks a ?method= value from the address.
// Takes: the value. Gives back: the same value if it's one of the choices,
// otherwise "" (All).
export function cleanEarningsMethod(value: string): string {
  return Object.hasOwn(FILTERS, value) ? value : "";
}

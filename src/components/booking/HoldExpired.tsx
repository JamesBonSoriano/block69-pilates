// "Your seat was released": shown when the seat hold ran out before payment.
// This is the "Payment expired" page from CLAUDE.md section 4.
// Where it's used: the pay page (/book/pay/[bookingId]), both when the live
// countdown reaches 0:00 (inside PayHold.tsx) and when someone opens an
// expired booking later.
// No charge was made, and nothing needs undoing: an ended hold simply stops
// counting as a taken seat in the database.

import { TimerOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type HoldExpiredProps = {
  sessionId: string; // the class, so they can try the same one again
  bookingId: string; // the ended hold, so step 2 can fill its choices back in
  holdMinutes: number; // how long seats are held, from settings
  headingLevel?: "h1" | "h2"; // h1 when it's the whole page, h2 inside step 3
};

// The "seat released" card.
// Takes: the class id, the ended hold's id, the hold length and which heading tag to use.
// Gives back: a card with what happened and two ways to book again.
export function HoldExpired({ sessionId, bookingId, holdMinutes, headingLevel = "h2" }: HoldExpiredProps) {
  const Heading = headingLevel;
  return (
    <Card className="mb-10 flex max-w-xl flex-col items-start gap-4">
      <span className="flex size-14 items-center justify-center rounded-full bg-error-bg text-error">
        <TimerOff aria-hidden="true" className="size-7" />
      </span>
      <Heading className="text-2xl font-normal leading-tight">Your seat was released</Heading>
      <p className="text-sm leading-relaxed text-muted">
        We held your seat for {holdMinutes} minutes, but the payment wasn&apos;t finished in time, so
        the seat is open for others again. Nothing was charged.
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        {/* Step 2 checks again if the class still has a seat, and (with
            from=) fills in the choices from this ended hold */}
        <ButtonLink href={`/book/details?session=${sessionId}&from=${bookingId}`}>Try this class again</ButtonLink>
        <ButtonLink href="/book" variant="secondary">
          Pick another class
        </ButtonLink>
      </div>
    </Card>
  );
}

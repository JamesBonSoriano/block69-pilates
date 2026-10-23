// Shows editable page text (site_content) on a page.
// Where it's used: Home, About Us and Policies.
//
// Text in [SQUARE BRACKETS], like "[INSTRUCTOR NAME]", is a placeholder that
// the cafe hasn't filled in yet. It's shown with a dashed outline so the team
// spots it straight away (and fills it in on the Content Management or
// Settings page before the site goes live).
//
// Fill-in words like {mat_price} must already be swapped (fillSettings() in
// src/lib/content-text.ts) before the text gets here. The LINK fill-in words
// {facebook_link} / {instagram_link} may be left in (keepLinks): pass
// links={socialLinks(settings)} and they become real links (Change 17).

import { Check } from "lucide-react";
import { Fragment } from "react";
import { splitLines, type SocialLink } from "@/lib/content-text";
import { cn } from "@/lib/cn";

// Finds placeholders: "[" then up to 120 characters that aren't "]", then "]".
// The brackets ( ) around it make split() keep the placeholders in the list.
const PLACEHOLDER = /(\[[^\]\n]{1,120}\])/;

// Finds link fill-in words like {facebook_link} (kept by split(), as above).
const LINK_WORD = /(\{[a-z]+_link\})/;

// One piece of text, with any placeholders outlined (and, if links are
// given, {facebook_link}-style words turned into links).
// Takes: the text, and optionally the links (from socialLinks()).
// Gives back: the text, where each [PLACEHOLDER] is in a dashed box.
export function ContentText({ text, links }: { text: string; links?: Record<string, SocialLink> }) {
  // "Find us on {facebook_link}" -> ["Find us on ", "{facebook_link}", ""]
  const pieces = links ? text.split(LINK_WORD) : [text];
  return (
    <>
      {pieces.map((piece, p) => {
        // The link words sit at the odd positions (1, 3, 5...)
        if (p % 2 === 1) {
          const link = links?.[piece.slice(1, -1)];
          if (!link) return <Fragment key={p}>{piece}</Fragment>;
          // Not set in Settings: just the word
          if (!link.href) return <Fragment key={p}>{link.label}</Fragment>;
          return (
            <a
              key={p}
              href={link.href}
              target="_blank"
              // Another website: it can't control our page
              rel="noopener noreferrer"
              className="font-semibold text-brown underline underline-offset-4"
            >
              {link.label}
            </a>
          );
        }
        // "Call [CAFE PHONE] now" -> ["Call ", "[CAFE PHONE]", " now"]
        return (
          <Fragment key={p}>
            {piece.split(PLACEHOLDER).map((part, i) =>
              // split() puts the placeholders at the odd positions (1, 3, 5...)
              i % 2 === 1 ? (
                <span
                  key={i}
                  className="rounded-md border border-dashed border-caramel bg-tan-soft/60 px-1 text-brown"
                >
                  {part}
                </span>
              ) : (
                part
              ),
            )}
          </Fragment>
        );
      })}
    </>
  );
}

// Text with one paragraph per line.
// Takes: the text, extra classes for each paragraph, and optionally the
// social links (see ContentText).
// Gives back: a <p> for every non-empty line (nothing if the text is empty).
export function Paragraphs({
  text,
  className,
  links,
}: {
  text: string;
  className?: string;
  links?: Record<string, SocialLink>;
}) {
  return (
    <>
      {splitLines(text).map((line, i) => (
        <p key={i} className={className}>
          <ContentText text={line} links={links} />
        </p>
      ))}
    </>
  );
}

// A list with a green tick (or a plain dot) before each item (one item per
// line of text).
// Takes: the text, the marker ("check" for good things like what's included,
// "dot" for rules and warnings) and extra classes for the list.
// Gives back: a <ul> (nothing if the text is empty).
export function CheckList({
  text,
  marker = "check",
  className,
}: {
  text: string;
  marker?: "check" | "dot";
  className?: string;
}) {
  const items = splitLines(text);
  if (items.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-2 text-sm leading-relaxed lg:text-[15px]", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          {marker === "check" ? (
            <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-success" strokeWidth={2.5} />
          ) : (
            // A small dot in the text's own color, lined up with the first line
            <span aria-hidden="true" className="mx-1.5 mt-2.5 size-1.5 shrink-0 rounded-full bg-current" />
          )}
          <span>
            <ContentText text={item} />
          </span>
        </li>
      ))}
    </ul>
  );
}

// A numbered list (one item per line of text), e.g. the cancellation policy
// and the Registration Agreement.
// Takes: the text and extra classes for the list.
// Gives back: an <ol> with brown number circles (nothing if the text is empty).
export function NumberedList({ text, className }: { text: string; className?: string }) {
  const items = splitLines(text);
  if (items.length === 0) return null;
  return (
    <ol className={cn("flex flex-col gap-3 text-sm leading-relaxed lg:text-[15px]", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          {/* The number circle (screen readers already hear the list number) */}
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tan-soft font-heading text-xs font-semibold text-brown"
          >
            {i + 1}
          </span>
          <span className="pt-0.5">
            <ContentText text={item} />
          </span>
        </li>
      ))}
    </ol>
  );
}

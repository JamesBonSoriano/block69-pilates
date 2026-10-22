// Shared pill-shaped buttons (CLAUDE.md section 7: "fully rounded pills").
// Where it's used: every page. Use <Button> for actions (submit a form, open
// something) and <ButtonLink> for links that look like buttons (Book Now).
//
// Variants:
//   primary      brown fill, light text (the main action on a screen)
//   secondary    brown outline
//   danger       red outline (cancel a booking, deactivate, ...)
//   light        cream fill, brown text: a main action on a BROWN background (header)
//   lightOutline cream outline: a second action on a BROWN background (phone menu)

import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "light"
  | "lightOutline";

// The color classes for each variant.
const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-brown bg-brown text-card hover:bg-brown/90 focus-visible:outline-brown",
  secondary: "border-brown text-brown hover:bg-brown/5 focus-visible:outline-brown",
  danger: "border-error text-error hover:bg-error-bg focus-visible:outline-error",
  light: "border-cream bg-cream text-brown hover:bg-tan-soft focus-visible:outline-cream",
  lightOutline: "border-cream text-cream hover:bg-cream/10 focus-visible:outline-cream",
};

// Builds the class list shared by <Button> and <ButtonLink>.
// Takes: the variant, whether it fills the full width, and any extra classes.
// Gives back: one class string.
export function buttonClasses(
  variant: ButtonVariant = "primary",
  fullWidth = false,
  className?: string,
): string {
  return cn(
    // Pill shape, Poppins, and at least 44px tall so it's easy to tap on phones
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-[1.25px] px-5 py-3",
    "font-heading text-sm font-semibold leading-none no-underline transition-colors",
    // A clear outline when someone moves to the button with the keyboard (Tab)
    "focus-visible:outline-2 focus-visible:outline-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    variantClasses[variant],
    fullWidth && "w-full",
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
};

// A real <button> element.
// Takes: variant (default "primary"), fullWidth, and any normal button
// attributes (onClick, type, disabled, ...).
// Gives back: the styled button. `type` defaults to "button" so it never
// submits a form by accident; pass type="submit" for form buttons.
export function Button({
  variant = "primary",
  fullWidth = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, fullWidth, className)}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  // true for links to other websites (e.g. Messenger): opens in a new tab
  external?: boolean;
};

// A link that looks like a button.
// Takes: href, variant (default "primary"), fullWidth, external, and normal
// link attributes.
// Gives back: a Next.js <Link> for our own pages (fast, no full reload), or a
// plain <a> opening a new tab for other websites.
export function ButtonLink({
  variant = "primary",
  fullWidth = false,
  external = false,
  className,
  href,
  ...props
}: ButtonLinkProps) {
  const classes = buttonClasses(variant, fullWidth, className);

  if (external) {
    return (
      <a
        href={String(href)}
        target="_blank"
        // Security: the new tab can't control our page
        rel="noopener noreferrer"
        className={classes}
        {...(props as ComponentProps<"a">)}
      />
    );
  }

  return <Link href={href} className={classes} {...props} />;
}

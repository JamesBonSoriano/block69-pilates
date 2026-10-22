// A tiny helper for joining Tailwind class names.
// Where it's used: the shared components in src/components/, so a page can add
// its own classes on top of a component's default classes.

// Joins class names into one string, skipping empty ones.
// Takes: any number of class strings, or false / null / undefined for "skip this".
// Gives back: one string, e.g. cn("p-4", isActive && "bg-tan-soft") -> "p-4 bg-tan-soft".
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

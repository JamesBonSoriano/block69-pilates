// Reads the two PUBLIC Supabase settings from .env.local.
// Where it's used: every Supabase client in this folder (browser, server,
// public and proxy).
//
// Both values are safe for the browser (that's what NEXT_PUBLIC_ means):
// Row Level Security in the database decides what they can see.
// The SECRET key is never read here; it will only ever be used in server code.

// Gives back the Supabase project URL and publishable key.
// Takes: nothing.
// Gives back: { url, publishableKey }, or throws a clear error if .env.local
// hasn't been filled in yet (so you know exactly what's wrong).
export function getSupabaseEnv(): { url: string; publishableKey: string } {
  // Next.js swaps these for the real values when it builds the site.
  // They must be written out in full like this (not process.env[name]),
  // otherwise Next.js can't swap them in browser code.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase keys are missing. Copy .env.example to .env.local, fill in " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, " +
        "then restart `npm run dev`.",
    );
  }

  return { url, publishableKey };
}

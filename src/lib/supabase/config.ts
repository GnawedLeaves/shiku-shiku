// Supabase connection settings, resolved in one place.
//
// Supabase renamed the browser-safe key: newer projects issue a "publishable"
// key (sb_publishable_...) while older ones issue an "anon" key. Both names are
// accepted here so the app works whichever the dashboard handed you. They have
// to be referenced as full literals -- Next.js inlines NEXT_PUBLIC_* variables
// at build time and can't resolve a computed lookup.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in .env.local."
  );
}

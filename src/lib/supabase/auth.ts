import { cache } from "react";
import { createClient } from "./server";

export interface CurrentUser {
  id: string;
  email: string | null;
}

/**
 * The signed-in user for this request, or null.
 *
 * Uses `getClaims()`, which verifies the session JWT's signature (locally,
 * against the project's cached public keys) instead of `getUser()`'s round trip
 * to the Supabase Auth server -- that round trip, repeated by the middleware,
 * the layout and the page, was most of the wait on every navigation. `cache`
 * dedupes it further, so a layout and page rendering together share one check.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

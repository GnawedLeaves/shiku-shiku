import { headers } from "next/headers";

/**
 * Absolute base URL for links that leave the app (share links, OAuth
 * redirects), without a trailing slash -- `NEXT_PUBLIC_SITE_URL` is often set
 * as `https://example.app/`, which would otherwise produce `//share/...`.
 * Falls back to the host the request came in on, so links built in dev or on
 * a LAN address point somewhere a friend's device can actually open.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return "http://localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}

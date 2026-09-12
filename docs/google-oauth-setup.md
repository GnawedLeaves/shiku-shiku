# Adding "Continue with Google" (Supabase + Next.js App Router)

Written for: whoever is setting this app up, following along in the Google Cloud and Supabase
dashboards. It assumes no prior OAuth knowledge.

The code in this repo already implements the flow. This guide is about the dashboard
configuration, plus an explanation of what each piece of code does so you can debug it.

---

## The short version

1. Create OAuth credentials in Google Cloud.
2. Paste the client ID + secret into Supabase → Authentication → Providers → Google.
3. Copy the callback URL Supabase shows you into Google's "Authorized redirect URIs".
4. Add your site URL and `/auth/callback` to Supabase → Authentication → URL Configuration.
5. Set `NEXT_PUBLIC_SITE_URL` in `.env.local` (and in Vercel for production).

Total time: about 10 minutes.

---

## Step 1 — Google Cloud: create OAuth credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project (or pick
   an existing one). Name it anything — "shiku-shiku" is fine.
2. In the sidebar, go to **APIs & Services → OAuth consent screen**.
   - User type: **External**. (Internal is only for Google Workspace organisations.)
   - App name: `Shiku Shiku`. Support email: your own.
   - Developer contact: your email. Save and continue.
   - Scopes: you don't need to add any — the defaults (`email`, `profile`, `openid`) are what
     Supabase asks for. Save and continue.
   - Test users: while the app is in "Testing" mode, **only accounts listed here can sign in**.
     Add your own Google account. (You can publish the app later to remove this limit.)
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Shiku Shiku web`.
   - **Authorized JavaScript origins**: add
     - `http://localhost:3000`
     - `https://<your-domain>` (your Vercel domain, once you have it)
   - **Authorized redirect URIs**: leave this for a moment — Step 2 gives you the exact value.
4. Click Create. Keep the **Client ID** and **Client secret** dialog open.

> The redirect URI is the single most common source of `redirect_uri_mismatch` errors. It must
> match what Supabase sends, character for character, including `https://` and no trailing slash.

## Step 2 — Supabase: enable the Google provider

1. Open your project at [supabase.com](https://supabase.com) → **Authentication → Sign In / Providers
   → Google**.
2. Toggle **Enable Sign in with Google**.
3. Paste the **Client ID** and **Client secret** from Step 1.
4. Supabase displays a **Callback URL (for OAuth)** that looks like:

   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

   Copy it.
5. Save.

## Step 3 — Put Supabase's callback URL back into Google

Return to the Google Cloud credential from Step 1 → **Authorized redirect URIs** → Add URI → paste
the `https://<project-ref>.supabase.co/auth/v1/callback` value → Save.

This is the URI Google redirects to. Your own `/auth/callback` route is where **Supabase** sends the
user afterwards — a different thing, configured in the next step.

## Step 4 — Supabase: URL configuration

**Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000` for development, your production domain when you deploy.
- **Redirect URLs** (allow-list — add every one you use):
  - `http://localhost:3000/auth/callback`
  - `https://<your-domain>/auth/callback`

If a redirect URL isn't on this list, Supabase silently sends the user to the Site URL instead,
which looks like "sign-in worked but I ended up on the wrong page".

## Step 5 — Environment variables

In `.env.local` (see `.env.local.example`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

In Vercel, set the same three with `NEXT_PUBLIC_SITE_URL` pointing at your production domain.
`NEXT_PUBLIC_SITE_URL` is what the sign-in action uses to build `redirectTo`, so if it's wrong in
production, users get bounced back to localhost.

---

## How the code works

Three files implement the flow. Nothing here needs changing — this is so you can follow it when
something misbehaves.

### 1. Starting the flow — `src/lib/actions/auth.ts`

```ts
export async function signInWithGoogle() {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });

  if (error || !data?.url) {
    redirect(`/login?error=…`);
  }

  redirect(data.url); // hand the browser over to Google
}
```

It's a Server Action, so the login page can call it from a plain `<form action={signInWithGoogle}>`
and it works even before JavaScript has hydrated.

`signInWithOAuth` on the server **doesn't redirect by itself** — it returns the Google URL, and the
action redirects to it. That's the key difference from the browser-side SDK.

### 2. Completing the flow — `src/app/auth/callback/route.ts`

Google → Supabase → your `/auth/callback?code=…`. The route exchanges that one-time code for a
session and writes the auth cookies:

```ts
const { error } = await supabase.auth.exchangeCodeForSession(code);
```

Because this is a Route Handler, it is allowed to set cookies (Server Components are not). This is
why the callback is a route and not a page.

### 3. Keeping the session fresh — `src/proxy.ts` + `src/lib/supabase/middleware.ts`

Supabase access tokens expire after an hour. `updateSession` runs on every matched request, calls
`supabase.auth.getUser()`, and — when the token was refreshed — copies the new cookies onto the
response. Without it, users get signed out mid-session.

> Next.js 16 renamed `middleware.ts` to `proxy.ts`; the exported function is `proxy`. That's why
> this repo has `src/proxy.ts` rather than the `middleware.ts` you may have seen in older guides.

Two rules worth keeping in mind if you edit these files:

- Always create the Supabase server client with the `getAll`/`setAll` cookie methods (this repo
  does). The older single-cookie `get`/`set`/`remove` API is deprecated in `@supabase/ssr`.
- Never trust `getSession()` on the server for authorisation — it reads the cookie without
  verifying it. Use `getUser()`, which validates with the Auth server. That's what the app layout
  and every Server Action here do.

### 4. Where the profile row comes from

`supabase/migrations/0001_init.sql` installs a trigger on `auth.users`:

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

It copies `raw_user_meta_data ->> 'full_name'` (which Google supplies) into `public.profiles`, so a
Google user has a display name the first time they land on the dashboard.

---

## Adding other providers

The same three files work for any OAuth provider Supabase supports. To add GitHub, say:

1. Enable GitHub in Supabase → Authentication → Providers, paste its client ID/secret, and copy the
   same `https://<project-ref>.supabase.co/auth/v1/callback` into the GitHub OAuth app settings.
2. Add an action next to `signInWithGoogle`:

   ```ts
   export async function signInWithGitHub() {
     const supabase = await createClient();
     const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
     const { data, error } = await supabase.auth.signInWithOAuth({
       provider: "github",
       options: { redirectTo: `${siteUrl}/auth/callback` },
     });
     if (error || !data?.url) redirect("/login?error=Could+not+start+GitHub+sign-in");
     redirect(data.url);
   }
   ```

3. Add a button on the login page. The callback route needs no changes — it's provider-agnostic.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `redirect_uri_mismatch` from Google | Google's authorized redirect URI ≠ Supabase's callback URL | Copy the exact URL from Supabase → Providers → Google into Google Cloud → Credentials |
| Signed in but landed on the home page, not the dashboard | `/auth/callback` isn't in Supabase's Redirect URLs allow-list | Add it under Authentication → URL Configuration |
| Works locally, redirects to localhost in production | `NEXT_PUBLIC_SITE_URL` still `http://localhost:3000` in Vercel | Set the production value in Vercel env vars and redeploy |
| "Access blocked: app not verified" / only your account can sign in | OAuth consent screen is in Testing mode | Add testers, or publish the consent screen |
| Signed out after an hour | Proxy not running on the route | Check the `matcher` in `src/proxy.ts` covers it |
| `Could not authenticate` on `/login` | `exchangeCodeForSession` failed — usually a reused or expired code | Start sign-in again; don't refresh the callback URL |

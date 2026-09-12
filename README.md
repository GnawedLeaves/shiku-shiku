# Shiku Shiku (しく しく)

Swipeable flashcards for learning Japanese vocab. Next.js (App Router) + TypeScript, Supabase
(auth/database), DaisyUI, deployed on Vercel. Installable as a PWA.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project.
2. In the SQL editor, run the migrations in order:
   - `supabase/migrations/0001_init.sql` — tables, RLS policies, and the sharing/copying helpers.
   - `supabase/migrations/0002_social_history_tagging.sql` — profile pictures, card tagging,
     study history, friends, scoreboards, battle rooms, and the fast one-roundtrip grading
     function. It also creates the `avatars` storage bucket.
3. (Optional, for "Continue with Google") Follow [docs/google-oauth-setup.md](docs/google-oauth-setup.md)
   — a step-by-step walkthrough of the Google Cloud and Supabase dashboards, plus how the callback
   code works.
4. In **Project Settings → API**, copy the Project URL and the anon/publishable key.

## 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from step 1. Leave
`NEXT_PUBLIC_SITE_URL` as `http://localhost:3000` for local dev.

> Supabase now labels that key "publishable" on new projects. Either name works —
> `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see
> `src/lib/supabase/config.ts`).

Google Document AI is optional and only needed to import scanned or photographed vocab sheets; see
[docs/pdf-import.md](docs/pdf-import.md).

## 3. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, create a set, add some cards, and
start a study session.

> Note: `npm run dev` / `npm run build` pass `--webpack` explicitly. The PWA plugin
> (`@ducanh2912/next-pwa`) hooks into the webpack build to generate the service worker, and
> Next.js 16 defaults to Turbopack otherwise.

## What's implemented

- Email/password + Google sign-in (Supabase Auth), progress kept per user.
- Sets, card groups used as **tags** (a card can be in several), and manual card entry.
- **Japanese suggestions while you type** — enter the English meaning and the card form offers
  dictionary matches (Jisho), filling in kana, kanji and romaji. Romaji also auto-derives from the
  kana as you type it.
- **PDF import** — upload a lesson PDF and the word table is extracted, page by page; pages with no
  table (grammar notes, scans) are skipped and reported. Layout templates are selectable, with an
  optional Google Document AI OCR fallback for scanned sheets. See
  [docs/pdf-import.md](docs/pdf-import.md).
- Swipeable study sessions (drag or buttons), pause/resume, up to 5 sessions in progress at once,
  scoped to a whole set, specific group(s), or a random sample (10/20/50/custom).
- **Study history** — every finished session with score, duration and a per-card right/wrong
  breakdown.
- **Profiles and friends** — avatar upload (Supabase Storage), username, and send/accept/decline
  friend requests.
- **Shared-set scoreboards** — best score per player, pooled across a shared set and every copy
  imported from it.
- **Battle rooms (skeleton)** — create a room, share the code, join, ready up. Live head-to-head
  rounds are not implemented yet.
- Set sharing via a code/link that imports a copy into another account's library, and copying
  selected cards from one of your sets into another.
- Romaji / hiragana / both answer display setting.
- Installable PWA (manifest + service worker; disabled in dev).

## Deploying

Push this repo to GitHub and import it in [Vercel](https://vercel.com/new). Set the same three
environment variables from `.env.local` in the Vercel project settings (use your production
`NEXT_PUBLIC_SITE_URL`), and add the production `/auth/callback` redirect URL in both Supabase and
Google Cloud if using Google sign-in.

## Still to do

- **Live battle gameplay.** Rooms, invite codes and the lobby exist; synchronised rounds,
  per-answer scoring and realtime presence do not.
- **Friend profile pages.** You can add friends and see the list; there's no public profile view of
  a friend's sets or stats yet.
- **Set-to-set scoreboard discovery.** Scoreboards are reachable from a set; there's no global
  leaderboard browser.

## Performance notes

Grading a card used to take five sequential Supabase roundtrips and then re-rendered the whole
study route, which is why "got it right" felt slow. Now:

- `record_swipe` (a Postgres function) does the queue update, progress upsert, session write and
  end-of-session result row in **one** roundtrip.
- The study screen advances **optimistically** — the next card renders on the same frame as the tap,
  with the write happening behind it.
- The session route is no longer revalidated on every swipe.
- `loading.tsx` skeletons and pending spinners cover navigation and form submissions.

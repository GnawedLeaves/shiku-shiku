# Shiku Shiku (しく しく)

Swipeable flashcards for learning Japanese vocab. Next.js (App Router) + TypeScript, Supabase
(auth/database), DaisyUI, deployed on Vercel. Installable as a PWA.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project.
2. In the SQL editor, run the contents of `supabase/migrations/0001_init.sql`. This creates all
   tables, row-level security policies, and the two helper functions used for sharing sets and
   copying cards between sets.
3. (Optional, for "Continue with Google") In **Authentication → Providers → Google**, enable the
   provider and fill in your Google OAuth client ID/secret. Add
   `http://localhost:3000/auth/callback` and `https://<your-vercel-domain>/auth/callback` as
   authorized redirect URIs in the Google Cloud console.
4. In **Project Settings → API**, copy the Project URL and anon public key.

## 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from step 1. Leave
`NEXT_PUBLIC_SITE_URL` as `http://localhost:3000` for local dev.

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
- Sets, groups within a set, and manual card entry (question + hiragana/romaji/kanji answers).
- PDF/image import screen — upload UI and an editable review table are wired up, but the actual
  word-extraction step is stubbed (`src/lib/study/parseSheet.ts`) until a sample sheet is
  available to build a real parser against.
- Swipeable study sessions (drag or buttons), pause/resume, up to 5 sessions in progress at once,
  scoped to a whole set, specific group(s) (shown together as a batch), or a random sample
  (10/20/50/custom).
- Set sharing via a code/link that imports a copy into another account's library, and copying
  selected cards from one of your sets into another.
- Romaji / hiragana / both answer display setting.
- Installable PWA (manifest + service worker; disabled in dev).

`session_results` and `card_progress` tables are already in the schema to support a future
scoreboard (feature 9 from the brief), but there's no UI for it yet.

## Deploying

Push this repo to GitHub and import it in [Vercel](https://vercel.com/new). Set the same three
environment variables from `.env.local` in the Vercel project settings (use your production
`NEXT_PUBLIC_SITE_URL`), and add the production `/auth/callback` redirect URL in both Supabase and
Google Cloud if using Google sign-in.

## Upcoming features

1. auto suggest translation in jap when keying in the english
2. upload and scan and parse words from PDF
3. scoreboard for shared sets / invite to room for flashcards battle
4. study session history list : show a list of the score and answers that were right and wrong
5. profile picture and add friend feature
6. loading indicators for when page is loading
7. adding cards to group feature not clear and not complete. cannot add cards to group, maybe checkbox then can press add to group then show a list of groups to add to. its basically tagging
8.

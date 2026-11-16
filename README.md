# Macrocoach

Calorie and macro tracker built as a web app (PWA) you add to your iPhone home screen.
Next.js 16, Tailwind 4, Supabase (database, login, photo storage), USDA FoodData Central.

## Setup

1. `npm install`
2. Supabase: create a project, open SQL Editor, paste and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` and fill in the Supabase URL and key (Project Settings > API) and a free USDA key (https://fdc.nal.usda.gov/api-key-signup).
4. `npm run dev` and open http://localhost:3000 (the camera needs https, so test scanning on the deployed site).
5. Tests: `npx tsx --test tests/math.test.ts`

## Deploy

Push to GitHub, import the repo in Vercel, and add the same four environment variables
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `USDA_API_KEY`, optional `OFF_USER_AGENT`).
Never put the USDA key in a `NEXT_PUBLIC_` variable.

On the iPhone: open the Vercel address in Safari, Share, Add to Home Screen.

## What is where

- `lib/` the math (tdee, nutrition, trend, checkin, barcode), data helpers, and the offline queue
- `components/` the screens; `app/` routes and the two `/api` proxies
- `supabase/schema.sql` tables, row level security, private photo bucket

## Known limits (not verified on a real phone yet)

- Barcode camera in a home-screen app on iOS has had WebKit bugs. If it fails, open the site in Safari to scan, or type the number.
- `html5-qrcode` call signatures were written from memory, not checked against its docs.
- Offline: entries made without signal are saved on the phone and sent when you are back online. The app shell is cached by `public/sw.js`.
- Weekly check-in is plain math (14-day weight slope vs your goal rate), capped at 200 kcal per adjustment, and it never goes below 1500 (men) or 1200 (women) kcal. It is a suggestion, not medical advice.
- `app/add/meal` is a leftover folder from the roadmap; it just redirects to `/add`. You can delete it.

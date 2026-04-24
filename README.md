# PortfolioX

PortfolioX is a React + Vite stock tracking app.

## Current app behavior

- Trade CRUD UI is in `src/App.jsx` (create, edit, delete).
- Holdings + summary cards are derived from saved trades.
- Data is read/written to Supabase REST using:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Why you may still see old UI on `http://localhost:4173`

`npm run preview` serves the `dist/` build output. If `dist/` was built earlier, preview can show older UI.

To avoid this, this repo now runs **build + preview together** when you use:

```bash
npm run preview
```

## Setup

1. Create env file:

```bash
cp .env.example .env
```

2. Fill:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_FINNHUB_API_KEY`
- `VITE_TWELVEDATA_API_KEY` for better TSX live price coverage
- `VITE_GOOGLE_SHEETS_QUOTES_URL` for a free Google Sheets price feed

3. Run locally:

```bash
npm install
npm run dev
```

Open the URL from terminal (usually `http://localhost:5173`).

## Free Google Sheets quotes

If you use `VITE_GOOGLE_SHEETS_QUOTES_URL`, the app now:

- reads TSX prices from your Google Sheet
- auto-registers new stock symbols in that sheet when you save a trade

Your Apps Script web app should support:

- `GET` to return rows as JSON
- `POST` with `{ "symbol": "MDA", "google_symbol": "TSE:MDA" }` to append the symbol if it does not already exist

## Supabase permissions

This version of the UI reads and writes `trades` through the Supabase REST API using the anon key from `.env`.

If your Supabase project returns `permission denied for table trades`, the frontend is reaching your database correctly, but the `anon` role is not allowed to access that table yet. You need one of these:

- Add `SELECT`, `INSERT`, `UPDATE`, and `DELETE` policies for the `anon` role on `trades`.
- Or refactor the app to use authenticated Supabase sessions and policies tied to `auth.uid()`.

Do not put the Supabase service-role key in the frontend.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

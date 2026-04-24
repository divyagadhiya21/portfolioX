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

3. Run locally:

```bash
npm install
npm run dev
```

Open the URL from terminal (usually `http://localhost:5173`).

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

# PortfolioX

PortfolioX is a React + Vite stock tracking app scaffold that includes service and hook layers for:

- Finnhub quote fetching (`src/services/finnhub.js`)
- Supabase auth + portfolio CRUD (`src/services/supabase.js`, `src/services/portfolio.js`)

## Important current status

The current `App.jsx` is still the default Vite starter UI and does **not** render trade forms, auth screens, or portfolio tables yet. That means your database code is present in the repo, but it is not wired to any visible frontend flow.

## Why entries from `file:///.../portfolioX.html` are not appearing in Supabase

If you open a static HTML file directly with the `file://` protocol, it is outside the Vite app runtime and does not use this project's React code or Vite env variables.

For this repo, Supabase and Finnhub keys are read using `import.meta.env.*`, which are only injected when running via Vite (`npm run dev` / `npm run build` + `npm run preview`).

## Setup checklist

1. Copy env template:

   ```bash
   cp .env.example .env
   ```

2. Fill in:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_FINNHUB_API_KEY`

3. Run app through Vite:

   ```bash
   npm install
   npm run dev
   ```

4. Open the local URL shown by Vite (typically `http://localhost:5173`), **not** a `file://` path.

## Recommended improvements

1. Replace starter `App.jsx` with real UI that calls `usePortfolio` + `useStockPrices`.
2. Add user-visible error states for Supabase/Finnhub failures.
3. Add validation for trade payloads (ticker, qty, price, type, date).
4. Ensure Supabase tables (`trades`, `alerts`) and RLS policies match `user_id`-based queries.
5. Add tests for calculation utilities (`src/utils/calculations.js`).
6. Add loading and empty states throughout the portfolio screens.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

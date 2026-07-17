# PortfolioX

PortfolioX is a React + Vite stock tracking app.

## Current app behavior

- Trade CRUD UI is in `src/App.jsx` (create, edit, delete).
- Holdings + summary cards are derived from saved trades.
- Auth and data are backed by Firebase (Email/Password Auth + Firestore). See `FIREBASE_SETUP.md`.
- Trades are stored per-user at `users/{uid}/trades/{tradeId}`.

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

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FINNHUB_API_KEY`
- `VITE_TWELVEDATA_API_KEY` for better TSX live price coverage
- `VITE_GOOGLE_SHEETS_QUOTES_URL` for a free Google Sheets price feed

See `FIREBASE_SETUP.md` for the one-time Firebase console step (enabling Email/Password auth).

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

## Firestore permissions

Trades are read/written through the Firestore client SDK, scoped to `users/{uid}/trades/{tradeId}`. `firestore.rules` only allows a signed-in user to read/write their own `users/{uid}` subtree — see `FIREBASE_SETUP.md`.

If you see `permission-denied` errors, confirm you are signed in and that `firestore.rules` has been deployed (`npm run deploy` or `firebase deploy --only firestore:rules`).

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run preview
npm run deploy          # build + deploy hosting and firestore rules
npm run deploy:hosting  # build + deploy hosting only
```

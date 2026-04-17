# ShepherdsCore Cloud — Project Notes

## Stack
- Frontend: Vite + React 18 + TypeScript + React Router DOM 6 (in `frontend/`)
- Backend: FastAPI / Python (in `backend/`, entry `backend/main.py`; also `api/index.py` for Vercel)
- Auth/DB: Supabase (migrations in `supabase/migrations/`)
- Deploy: Vercel (`vercel.json`)

## Key Paths
- Sidebar/nav: `frontend/src/components/Layout.tsx` (+ `Layout.module.css`)
- Auth (sign in / sign up / forgot / check-email): `frontend/src/pages/LoginPage.tsx` (+ `LoginPage.module.css`)
- Church settings (edits name/logo): `frontend/src/pages/SettingsPage.tsx`
- API client: `frontend/src/lib/api.ts`
- Auth context: `frontend/src/contexts/AuthContext.tsx`

## Branding
- ShepherdsCore logo asset: `frontend/public/shepherdscore-logo.png`
- Logo concept alternates: `frontend/public/logo-options/`
- Church logo URL: loaded via `api.get<ChurchInfo>('/settings')` → `church.logo_url`
  (uploaded via POST `/settings/logo`; stored as `logo_url` column, see migration `20240006_logo_and_features.sql`)
- Sidebar brand rule: if `church.logo_url` is set, it replaces the ShepherdsCore
  logo in the sidebar; otherwise ShepherdsCore logo is shown. Church name
  appears as caption below either way.
- Login/signup header uses the ShepherdsCore logo image (not text).

## Scripts
- `cd frontend && npm run dev` — Vite dev server
- `cd frontend && npm run build` — `tsc && vite build`
- Node modules are not committed; `npx tsc --noEmit` will error on missing
  `react`/`react-router-dom` types until `npm install` is run in `frontend/`.

## Git Conventions
- Recent commit style: `feat: …`, `fix: …`, `docs: …` (Conventional-ish,
  lowercase after prefix).
- Default branch: `main`.

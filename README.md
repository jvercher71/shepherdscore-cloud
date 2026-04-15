# ShepherdsCore Cloud

SaaS church management platform — multi-tenant, cloud-hosted version of ShepherdsCore.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Backend | FastAPI (Python 3.12) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| AI | Groq API (Llama 3.3 70B) |
| Billing | Stripe |
| Frontend Hosting | Vercel |
| Backend Hosting | Railway |

## Project Structure

```
shepherdscore-cloud/
├── frontend/          # React + Vite + TypeScript SPA
├── backend/           # FastAPI API server
├── supabase/
│   └── migrations/    # SQL migration files (run in order)
└── README.md
```

## Local Development

### Prerequisites

- Node.js 20+
- Python 3.12+
- Supabase CLI (`brew install supabase/tap/supabase`)

### 1. Supabase

```bash
# Start local Supabase stack
supabase start

# Apply migrations
supabase db reset
```

Copy the local URL and anon key from `supabase start` output.

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy and fill in env vars
cp .env.example .env
# Edit .env with your Supabase URL, service role key, and JWT secret

uvicorn main:app --reload --port 8000
```

The API docs are at http://localhost:8000/docs.

### 3. Frontend

```bash
cd frontend
npm install

# Copy and fill in env vars
cp .env.example .env.local
# Edit .env.local:
#   VITE_SUPABASE_URL=http://localhost:54321
#   VITE_SUPABASE_ANON_KEY=<from supabase start>
#   VITE_API_URL=http://localhost:8000

npm run dev
```

Open http://localhost:5173.

## Database Migrations

Migrations are in `supabase/migrations/` and must be applied in order:

| File | Description |
|---|---|
| `20240001_initial_schema.sql` | Core tables: churches, members, families, giving, events, groups |
| `20240002_rls_policies.sql` | Row Level Security — all data scoped to church_id |
| `20240003_church_onboarding.sql` | Auto-creates church + stamps JWT on user signup |

## Multi-tenancy Architecture

Every table that holds church data has a `church_id` UUID foreign key. Data isolation is enforced at two layers:

1. **RLS (Row Level Security)** — PostgreSQL policies ensure queries only return rows matching the authenticated user's `church_id` (read from JWT `app_metadata`).
2. **API layer** — FastAPI middleware decodes the Supabase JWT, extracts `church_id`, and scopes every query explicitly.

When a user signs up, a database trigger (`handle_new_user_church`) automatically:
- Creates a `churches` row
- Stamps `church_id` into `auth.users.raw_app_meta_data`
- This flows into every subsequent JWT issued to that user

## Deployment

### Backend → Railway

1. Connect your GitHub repo to Railway
2. Set root directory to `backend/`
3. Add environment variables from `.env.example`
4. Railway auto-detects the `requirements.txt` and starts with `uvicorn main:app --host 0.0.0.0 --port $PORT`

Add a `railway.toml` or `Procfile` if needed:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend → Vercel

1. Connect your GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` (your Railway backend URL)

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS — keep secret) |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase project settings |
| `GROQ_API_KEY` | Groq API key for AI features |
| `STRIPE_SECRET_KEY` | Stripe secret key for billing |
| `CORS_ORIGINS` | Comma-separated allowed origins |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | Backend API base URL |

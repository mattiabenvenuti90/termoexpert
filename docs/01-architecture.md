# Architecture

High-level layers
- UI (Next.js App Router): pages, layouts, components
- State (Redux Toolkit + RTK Query): caching, data fetching, mutations
- API (Next.js route handlers): server endpoints, validation, auth guards
- Data (Prisma + Supabase Postgres): schemas, migrations, queries

Data flow
- UI dispatches RTK Query endpoints.
- RTK Query calls Next.js API routes (server-controlled access only).
- API routes use Prisma to access Supabase Postgres.
- Responses normalized in RTK Query and exposed to UI.

Supabase usage
- Primary DB with Supabase Auth enabled (remote project).
- Prisma connects to Supabase Postgres using DATABASE_URL.
- API routes validate Supabase JWT and enforce RLS policies.

Suggested folder layout
- app/ (Next.js App Router)
- app/api/ (route handlers)
- src/components/
- src/store/ (Redux store)
- src/services/ (RTK Query API slices)
- prisma/ (schema, migrations)
- lib/ (shared utilities, env)

Env variables (draft)
- DATABASE_URL=postgresql://...
- NEXT_PUBLIC_SUPABASE_URL=...
- NEXT_PUBLIC_SUPABASE_ANON_KEY=...
- SUPABASE_SERVICE_ROLE_KEY=... (server only)
- FLUIDA_API_URL=...
- FLUIDA_API_KEY=...
- NEXT_PUBLIC_APP_URL=http://localhost:3000

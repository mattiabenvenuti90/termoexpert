# Fluida Local Test (Next.js)

Stack
- Next.js App Router
- Redux Toolkit + RTK Query
- Supabase Auth (remote project)
- Prisma (Supabase Postgres)

Docs
- `docs/00-overview.md`
- `docs/01-architecture.md`
- `docs/02-migration-plan.md`
- `docs/03-setup.md`
- `docs/04-conventions.md`

Local setup
1) Copy `.env.example` to `.env.local` and fill keys.
2) Install dependencies: `npm install`
3) Prisma generate: `npx prisma generate`
4) Prisma migrate: `npx prisma migrate dev`
5) Start dev server: `npm run dev`

Notes
- API routes expect a Supabase JWT in the `Authorization: Bearer <token>` header.
- The UI uses RTK Query against `/api/*`.
- When Fluida API keys are missing, endpoints fall back to mock data.

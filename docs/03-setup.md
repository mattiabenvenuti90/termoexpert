# Local Setup (Draft)

Requirements
- Node.js LTS
- Supabase project (remote) with Auth enabled
- Database URL for Prisma

Steps
1) Create .env.local with required keys (see docs/01-architecture.md).
2) Install dependencies: npm install
3) Prisma: npx prisma generate
4) Prisma: npx prisma migrate dev
5) Start dev server: npm run dev

Notes
- Ensure Supabase JWT settings match Next.js API validation.
- Use mock mode when Fluida API is not available.

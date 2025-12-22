# Migration Plan

Phase 0 - Prep
- Freeze current prototype behavior and endpoints.
- Identify required features: exports, daily summary, sites, contracts.

Phase 1 - New Next.js skeleton
- Create Next.js app with App Router.
- Add Redux Toolkit + RTK Query.
- Add Prisma, connect to Supabase.
- Define base layout and navigation.

Phase 2 - Data model
- Design tables: users, contracts, exports, sites, associations, daily_summary.
- Implement Prisma schema and migrations.
- Seed minimal data for local testing.

Phase 3 - API routes
- Implement API routes for exports, daily summary, sites, contracts.
- Add mock mode for quick testing.
- Validate input and normalize output.

Phase 4 - UI screens
- Rebuild current UI as Next.js pages.
- Wire RTK Query hooks to the new API.
- Add pagination and filtering.

Phase 5 - Cleanup
- Remove legacy client/server folders.
- Update README and add deployment notes.

Risks and decisions
- Supabase Auth enabled now (remote project).
- RTK Query uses Next.js API routes only.

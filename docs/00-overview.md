# Project Overview

Goal
- Migrate the current prototype to a Next.js app using Supabase, Redux Toolkit + RTK Query, and Prisma.
- Keep the existing Fluida API integration and export flows, but reorganize them into a clean web app stack.

Target Stack
- Frontend: Next.js (App Router), React, Redux Toolkit, RTK Query
- Backend: Next.js API routes (or route handlers) with Prisma
- Database: Supabase Postgres (managed) + Supabase Auth (optional)
- Runtime: Node.js

Key Outcomes
- Single full-stack app with shared types and consistent data access.
- Clear separation: UI, state management, API layer, persistence.
- Repeatable local setup and deployment workflow.

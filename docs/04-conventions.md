# Conventions

Code
- TypeScript for all new files.
- React Server Components by default; client components only where needed.
- Keep API responses normalized for RTK Query.

State
- RTK Query for server data.
- Local UI state in components.
- Avoid global state unless shared across screens.

Naming
- kebab-case for folders, PascalCase for components.
- Use clear, domain-oriented names for API routes.

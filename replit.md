# Lavista Admin

## Overview
Staff admin panel for "Lavista" (bookings, calendar, rooms, experiences, reviews, media, content, FAQ, settings). Built with Lovable and imported from GitHub. Frontend/SSR app on TanStack Start (React 19 + TanStack Router) with Supabase as the backend (auth + data), styled with Tailwind CSS v4 and shadcn/Radix UI components.

## Tech stack
- **Runtime/package manager:** Bun
- **Framework:** TanStack Start (Vite-based SSR) + TanStack Router
- **Backend:** Supabase (see `src/integrations/supabase/`, `supabase/migrations/`)
- **Styling/UI:** Tailwind CSS v4, shadcn-style Radix UI components (`src/components`)
- **Config:** `vite.config.ts` wraps `@lovable.dev/vite-tanstack-config` (the Lovable-managed Vite/TanStack setup — most plugins are baked into that package, not this file)

## Running the project
- Workflow **"Start application"** runs `bun run dev` and serves on port 5000.
- The base Lovable Vite config defaults the dev server to host `::` (dual-stack), which this container's `net` stack rejects (`EAFNOSUPPORT`). `vite.config.ts` overrides `server.host` to `0.0.0.0`, `server.port` to `5000`, and sets `allowedHosts: true` so the Replit preview proxy (different origin) can reach it.
- Supabase credentials (URL + publishable/anon key) are already present in `.env` — no additional secrets were needed to boot the app.

## Structure
- `src/routes/` — TanStack Router file-based routes; `_authenticated/*` are staff-only pages behind Supabase auth.
- `src/integrations/supabase/` — Supabase client (browser + server) and auth middleware/attacher.
- `supabase/migrations/` — SQL schema migrations for the connected Supabase project.

## User preferences
None recorded yet.

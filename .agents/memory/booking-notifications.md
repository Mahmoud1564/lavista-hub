---
name: Booking notifications
description: Durable decisions for new-booking badges and email notifications.
---

The booking “New” state is intentionally stored per admin browser in local storage rather than added to Supabase.

**Why:** The existing bookings schema has no seen/notification field, and the feature request asked to avoid database changes unless strictly necessary.

**How to apply:** Keep badge state client-local unless the product later requires cross-admin synchronization; server email delivery must continue to read the saved booking from Supabase and keep provider credentials server-side.

The server-side notification requires `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the server environment; Vite-only `.env` values are not enough for `process.env` in the server function.

**Why:** The first notification attempt failed while initializing the Supabase admin client, before the Resend request was made.

**How to apply:** When debugging server functions, verify Replit environment availability for all server-only Supabase variables separately from browser `VITE_*` variables.
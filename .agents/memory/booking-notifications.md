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

For Node 20 Supabase Realtime, use the `ws` runtime package as the server transport; avoid adding `@types/ws`, which introduces global WebSocket type conflicts in this project.

**Why:** The supported transport removes the Supabase runtime warning, while the DefinitelyTyped package caused broad unrelated Supabase query type errors.

**How to apply:** Keep the narrow local `ws` module declaration and pass `ws` only when constructing Supabase clients on the server/SSR path.

Resend sender verification is scoped to the account/API key: a domain verified elsewhere is not usable by this project's restricted send-only key.

**Why:** A live request using the configured key and a sender on the verified domain returned `403 validation_error` stating that the domain was not verified; the same key cannot list domains because it is restricted to sending.

**How to apply:** If Resend rejects a verified-domain sender, verify the domain in the Resend account that owns the configured key or replace the key through Replit Secrets; do not guess another sender address.
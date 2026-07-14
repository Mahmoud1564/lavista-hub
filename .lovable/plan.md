# Admin Dashboard Overhaul Plan

Six interconnected changes. I'll implement them in this order so database changes land first, then UI follows.

## 1. Database migrations (single migration)

- **`booking_rooms` join table** for multi-room bookings:
  - `booking_id`, `room_id`, `check_in`, `check_out`, `price_per_night`
  - Keep legacy `bookings.room_id` nullable for now; backfill existing rows into `booking_rooms`.
  - Update `is_room_available` RPC to also check `booking_rooms`.
- **`room_pricing` table** for seasonal/per-date prices:
  - `room_id`, `start_date`, `end_date`, `price_per_night`, `label` (e.g. "High season"), `priority` (specific dates win over seasons).
- **Predefined amenities**: keep `room_amenities` table but UI uses a fixed list + custom string. No schema change needed (already a name field).
- **Drop staff role**: convert any existing staff users to admin, update approval trigger default to `admin`, remove staff from UI.
- **About image**: add `about_image_url` to `settings` table (single value) — replaces the `about_images` gallery for the admin side. Keep `about_images` table for now (non-breaking).
- Grants + RLS for new tables (admins manage, anon reads pricing for public site).

## 2. Inline image uploads on Create forms

Rooms, Experiences, Reviews, About:

- Refactor create dialogs to collect `File[]` in local state before insert.
- On submit: insert the row, then upload each file to storage using the new row id, then insert image rows. Show progress.
- Rooms create: allow marking one uploaded file as thumbnail before save.

## 3. Multi-room bookings

- Booking create/edit form: replace single room select with multi-select list. Each selected room gets its own check-in/out (default to booking dates) and nightly price.
- Booking list: show all room names per booking.
- Availability check runs per room via updated RPC.

## 4. Amenities picker

- New `src/lib/amenities.ts` constant with the 23 predefined amenities listed in the request.
- Replace text input in room form with checkbox grid + "Add custom" text field.

## 5. About image management

- In `settings.tsx` "Content" or new "About" card: single image uploader with preview, replace, delete. Writes to `settings.about_image_url` and uploads to `branding` bucket under `about/`.
- Public site reads from `settings.about_image_url`.

## 6. Availability Calendar page

New sidebar entry `/calendar`:

- Month grid showing every room as a row (Airbnb-style timeline) OR a room filter + single-room month view (simpler, ships faster). **I'll build the room-filter + month view** since it matches the existing per-room calendar and is genuinely usable on smaller screens.
- Each day cell shows: status (available/booked/blocked) and price (from `room_pricing` resolved by priority, falling back to `rooms.price_per_night`).
- Click a day → popover with: Block/unblock, Set price for date, Set seasonal range.
- Drag/select range → bulk block or bulk price.
- Auto-reflects bookings (already does via query).

The old "Calendar" button on the rooms list links here with the room preselected.

## Technical notes

- All storage uploads go through existing `src/lib/storage.ts` helpers + signed URL hook.
- Public website tables (`rooms`, `experiences`, `settings`, `about_images`, `room_pricing`) get `TO anon SELECT` policies so the public site can read without auth.
- No new server functions needed — direct supabase client calls with RLS suffice.

## Out of scope (will note to user)

- Migrating existing single-room bookings UI to fully drop `bookings.room_id` — kept as nullable for backwards compat; new bookings use `booking_rooms` only.
- Drag-to-select range on calendar (will ship click-start + click-end range selection, same as current per-room calendar).

Ready to proceed on approval.

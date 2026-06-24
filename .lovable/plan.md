
# Lavista Admin — Full Enhancement Pass

## 1. Database changes (one migration)

New / changed tables:

- `rooms`: rename `capacity` → `guests`, add `beds INT NOT NULL DEFAULT 1`, add `thumbnail_url TEXT`.
- `room_images`: add `sort_order INT DEFAULT 0`, add `is_thumbnail BOOL DEFAULT false`.
- `experiences`: add `duration TEXT`, `meeting_point TEXT`, `pickup_info TEXT`, `thumbnail_url TEXT`.
- `experience_dates` (new): `experience_id`, `date`, `is_available`.
- `experience_images`: add `sort_order`, `is_thumbnail`.
- `room_blocks` (new): `room_id`, `start_date`, `end_date`, `reason` — manual blocks for the calendar.
- `about_images` (new): `image_url`, `caption`, `sort_order`.
- `page_views` (new): `path`, `session_id`, `created_at` — visitor tracking.
- `pending_approvals` (new): `user_id`, `email`, `full_name`, `requested_role`, `status` (`pending|approved|rejected`), `decided_by`, `decided_at`.
- `settings`: ensure `logo_url`, `contact_email`, `contact_phone`, `address` exist (canonical location for contact info).
- `website_content`: prune unused sections (Hero CTA, Features, Footer, duplicate Contact). About section keeps text + links to `about_images`.

All new tables get GRANTs + RLS:
- Admin/staff full access via `has_role`.
- `anon` SELECT on public-facing tables (`about_images`, `experience_dates`, `room_blocks` read for booking availability, `settings` logo/contact).
- `anon` INSERT on `page_views` (visitor tracking).
- `pending_approvals`: only admins read/update; users can insert their own row.

Trigger: on `auth.users` insert → create `pending_approvals` row using metadata (`full_name`, `requested_role`).

## 2. Admin approval flow + emails

- Auth gate stays as-is (no role = "Access pending" screen).
- New `/settings` tab "Pending approvals": list pending users, Approve (with role: Admin/Staff) or Reject. Approve = insert into `user_roles` + mark approval row approved.
- New signup → server function enqueues an email to every existing admin with the new user's name, email, requested role, and approve link to `/settings`.
- Email setup: scaffold Lovable Emails infrastructure + one app-email template `new-user-approval-request`. Requires email domain — I'll open the setup dialog if one isn't configured yet.

## 3. Rooms module

- Admin form: rename Capacity → Guests, add Beds field.
- Multi-image upload (already partly there); add: drag handle for ordering, "Set as thumbnail" star button. Thumbnail mirrors to `rooms.thumbnail_url` for fast public reads.
- Amenities: keep current chip UI, add per-amenity icon picker (optional, default none).
- Public site reads `rooms.thumbnail_url` for cards, falls back to first image.

## 4. Experiences module

- Same multi-image + thumbnail treatment as rooms.
- New fields: Duration, Meeting/Pickup info.
- Available Dates: simple list editor (add date, remove date, mark available/unavailable) writing to `experience_dates`.

## 5. Availability calendar (Airbnb-style)

- New page `/rooms/$id/calendar` and a "Calendar" button on each room card.
- Month view grid. Each cell shows status:
  - **Booked** (from `bookings` with `status='confirmed'` or `'pending'`) — red, not clickable.
  - **Blocked** (from `room_blocks`) — gray, click to unblock.
  - **Available** — green, click-drag to block a range.
- Booking creation form validates against both sources via a `is_room_available(room_id, start, end)` SQL function; same function is used by the public booking flow to prevent double bookings.

## 6. Logo management

- Settings page: upload control writes to `settings.logo_url` (stored in a new public `branding` bucket). Public site nav reads it.

## 7. Website content cleanup

- Remove from `/content` admin page: Hero CTA button text, Features, Footer, Contact (now Settings-only).
- Keep: Hero title/subtitle/image, About text, SEO meta.
- Public site updated to read contact info from `settings` everywhere.

## 8. About gallery

- New `about_images` table + drag-to-reorder UI in `/content` under About.
- Public About section renders a responsive masonry/grid gallery from this table.

## 9. Dashboard analytics

- Tiny tracker in `__root.tsx` POSTs `{ path, session_id }` to a public server route on each route change. `session_id` stored in `sessionStorage` (no cookies, no PII).
- Dashboard adds three cards: Visitors today / this month / all-time, plus a 30-day bar chart (using `recharts`, already in shadcn ecosystem).

## 10. Public site
All public-facing pages updated to consume the new schema (thumbnails, gallery, calendar-gated booking, settings-driven contact + logo).

---

### Order of execution
1. Run the migration (you'll approve it).
2. Scaffold email infrastructure + auth approval template.
3. Write all admin UI changes + public site changes + tracker in one batch.
4. Tell you what to verify.

### What you'll need to do
- Approve the migration when prompted.
- If no email sender domain exists, complete the email domain setup dialog when it appears — then I continue automatically.
- After build, test signup → admin gets email → approve from Settings.

Reply **go** to execute, or tell me what to change.

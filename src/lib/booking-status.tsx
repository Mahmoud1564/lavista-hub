// Booking statuses — manually managed by administrators.
// The status stored in the DB is always the source of truth.

export type BookingStatus = "upcoming" | "checked_in" | "checked_out" | "cancelled";

export const ALL_STATUSES: BookingStatus[] = [
  "upcoming",
  "checked_in",
  "checked_out",
  "cancelled",
];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  upcoming:    "Upcoming",
  checked_in:  "Checked In",
  checked_out: "Checked Out",
  cancelled:   "Cancelled",
};

// Single unified badge style — same background and text color for every status.
// High-contrast foreground on a subtle neutral fill ensures WCAG AA readability
// in dark mode without relying on low-opacity accent colors.
const BADGE_CLASS = "bg-foreground/10 text-foreground border border-foreground/20";

export const STATUS_CLASSES: Record<BookingStatus, string> = {
  upcoming:    BADGE_CLASS,
  checked_in:  BADGE_CLASS,
  checked_out: BADGE_CLASS,
  cancelled:   BADGE_CLASS,
};

/**
 * Normalise a raw DB string to a known BookingStatus.
 * Any unknown value (including old "pending", "confirmed", "no_show") falls
 * back to "upcoming" so existing rows degrade gracefully.
 */
export function normalizeStatus(raw: string | null | undefined): BookingStatus {
  if (raw && (ALL_STATUSES as string[]).includes(raw)) return raw as BookingStatus;
  return "upcoming";
}

/**
 * StatusPill — uniform badge showing the booking status label.
 * `checkIn` / `checkOut` are accepted for backwards-compat but ignored;
 * status is purely the stored `rawStatus` value.
 */
export function StatusPill({
  rawStatus,
  checkIn: _ci,
  checkOut: _co,
}: {
  rawStatus?: string | null;
  checkIn?: string;
  checkOut?: string;
}) {
  const s = normalizeStatus(rawStatus);
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${BADGE_CLASS}`}>
      {STATUS_LABEL[s]}
    </span>
  );
}

/** @deprecated Status is no longer auto-computed from dates. */
export function computeBookingStatus(
  _checkIn: string,
  _checkOut: string,
  rawStatus?: string | null,
): BookingStatus {
  return normalizeStatus(rawStatus);
}

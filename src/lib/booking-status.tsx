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

// Per-status colored badge classes (used on the badge/pill only — NOT inside
// the dropdown option list, which always uses a neutral style).
export const STATUS_CLASSES: Record<BookingStatus, string> = {
  upcoming:    "bg-blue-500/20 text-blue-300 border border-blue-500/40",
  checked_in:  "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
  checked_out: "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
  cancelled:   "bg-red-500/20 text-red-300 border border-red-500/40",
};

/**
 * Normalise a raw DB string to a known BookingStatus.
 * Any unknown value falls back to "upcoming" so existing rows degrade gracefully.
 */
export function normalizeStatus(raw: string | null | undefined): BookingStatus {
  if (raw && (ALL_STATUSES as string[]).includes(raw)) return raw as BookingStatus;
  return "upcoming";
}

/**
 * StatusPill — colored fit-content badge for the booking status.
 * `checkIn` / `checkOut` accepted for backwards-compat but ignored.
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
    <span
      className={`inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_CLASSES[s]}`}
    >
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

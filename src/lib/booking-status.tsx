// Booking statuses are now manually managed by administrators.
// The status stored in the DB is always the source of truth.

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "upcoming"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

export const ALL_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "upcoming",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending:     "Pending",
  confirmed:   "Confirmed",
  upcoming:    "Upcoming",
  checked_in:  "Checked In",
  checked_out: "Checked Out",
  cancelled:   "Cancelled",
  no_show:     "No Show",
};

export const STATUS_CLASSES: Record<BookingStatus, string> = {
  pending:     "bg-yellow-500/15 text-yellow-500 border border-yellow-500/30",
  confirmed:   "bg-sky-500/15 text-sky-400 border border-sky-500/30",
  upcoming:    "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  checked_in:  "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  checked_out: "bg-muted text-muted-foreground border border-border",
  cancelled:   "bg-red-500/15 text-red-400 border border-red-500/30",
  no_show:     "bg-orange-500/15 text-orange-400 border border-orange-500/30",
};

/** Normalise a raw DB string to a known BookingStatus (fallback: "pending"). */
export function normalizeStatus(raw: string | null | undefined): BookingStatus {
  if (raw && (ALL_STATUSES as string[]).includes(raw)) return raw as BookingStatus;
  return "pending";
}

/**
 * StatusPill — renders a coloured badge for the booking status.
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[s]}`}>
      {STATUS_LABEL[s]}
    </span>
  );
}

/** @deprecated Use rawStatus directly — status is no longer auto-computed from dates. */
export function computeBookingStatus(
  _checkIn: string,
  _checkOut: string,
  rawStatus?: string | null,
): BookingStatus {
  return normalizeStatus(rawStatus);
}

// Compute a booking's display status from its dates.
// Raw DB status is only used when it's "cancelled"; otherwise the status is
// derived from today's date relative to check-in / check-out.

export type DisplayStatus = "upcoming" | "checked_in" | "checked_out" | "cancelled";

export function computeBookingStatus(
  checkIn: string,
  checkOut: string,
  rawStatus?: string | null,
): DisplayStatus {
  if (rawStatus === "cancelled") return "cancelled";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ci = new Date(checkIn); ci.setHours(0, 0, 0, 0);
  const co = new Date(checkOut); co.setHours(0, 0, 0, 0);
  if (today < ci) return "upcoming";
  if (today >= co) return "checked_out";
  return "checked_in";
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  upcoming: "Upcoming",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
};

// Tailwind class tokens for the badge. Using explicit color classes so the
// four states are visually distinct (blue / green / gray / red).
export const STATUS_CLASSES: Record<DisplayStatus, string> = {
  upcoming: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  checked_in: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  checked_out: "bg-muted text-muted-foreground border border-border",
  cancelled: "bg-red-500/15 text-red-400 border border-red-500/30",
};

export function StatusPill({ checkIn, checkOut, rawStatus }: { checkIn: string; checkOut: string; rawStatus?: string | null }) {
  const s = computeBookingStatus(checkIn, checkOut, rawStatus);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[s]}`}>
      {STATUS_LABEL[s]}
    </span>
  );
}

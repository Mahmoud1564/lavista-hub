import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Select, Label, Drawer, Badge } from "@/components/admin/ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isWithinInterval,
  isBefore,
  parseISO,
  addDays,
  differenceInCalendarDays,
} from "date-fns";
import { useSignedImage } from "@/hooks/use-signed-image";

const searchSchema = z.object({ roomId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/calendar")({
  validateSearch: searchSchema,
  component: CalendarPage,
});

type Block = { id: string; start_date: string; end_date: string; reason: string | null };
type Booking = {
  id: string;
  check_in: string;
  check_out: string;
  status: string;
  num_guests: number | null;
  notes: string | null;
  total_price: number | null;
  guest: { id: string; name: string; phone: string | null; email: string | null } | null;
};
type Room = { id: string; name: string; price: number; thumbnail_url: string | null };

function CalendarPage() {
  const search = useSearch({ from: "/_authenticated/calendar" });
  const qc = useQueryClient();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [roomId, setRoomId] = useState<string>(search.roomId ?? "");
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms-min"],
    queryFn: async () => {
      const { data } = await supabase
        .from("rooms")
        .select("id, name, price, thumbnail_url")
        .order("name");
      return (data ?? []) as Room[];
    },
  });

  if (!roomId && rooms.length) setRoomId(rooms[0].id);
  const room = rooms.find((r) => r.id === roomId);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const startStr = format(monthStart, "yyyy-MM-dd");
  const endStr = format(monthEnd, "yyyy-MM-dd");

  const { data: blocks = [] } = useQuery({
    queryKey: ["room-blocks", roomId, startStr],
    enabled: !!roomId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_blocks")
        .select("*")
        .eq("room_id", roomId)
        .gte("end_date", startStr)
        .lte("start_date", endStr);
      if (error) throw error;
      return (data ?? []) as Block[];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["room-bookings", roomId, startStr],
    enabled: !!roomId,
    queryFn: async () => {
      const sel =
        "id, check_in, check_out, status, num_guests, notes, total_price, guest:guests(id, name, phone, email)";
      const [legacy, joined] = await Promise.all([
        supabase
          .from("bookings")
          .select(sel)
          .eq("room_id", roomId)
          .in("status", ["upcoming", "confirmed", "pending", "checked_in"])
          .gte("check_out", startStr)
          .lte("check_in", endStr),
        supabase.from("booking_rooms").select(`booking:bookings(${sel})`).eq("room_id", roomId),
      ]);
      const out: Booking[] = [];
      (legacy.data ?? []).forEach((b) => out.push(b as unknown as Booking));
      (joined.data ?? []).forEach((j) => {
        const b = (j as { booking: Booking | null }).booking;
        if (
          b &&
          ["upcoming", "confirmed", "pending", "checked_in"].includes(b.status) &&
          b.check_out >= startStr &&
          b.check_in <= endStr &&
          !out.some((x) => x.id === b.id)
        )
          out.push(b);
      });
      return out;
    },
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);
  const today = new Date();

  function dayInfo(d: Date) {
    const dStr = format(d, "yyyy-MM-dd");
    const booking = bookings.find((b) => {
      const ci = parseISO(b.check_in),
        co = parseISO(b.check_out);
      return d >= ci && d < co;
    });
    const block = blocks.find((b) =>
      isWithinInterval(d, { start: parseISO(b.start_date), end: parseISO(b.end_date) }),
    );
    return { dStr, booking, block };
  }

  function inRange(d: Date) {
    if (!rangeStart) return false;
    const end = rangeEnd ?? rangeStart;
    const [a, b] = rangeStart <= end ? [rangeStart, end] : [end, rangeStart];
    return d >= a && d <= b;
  }

  function onClickDay(d: Date) {
    const info = dayInfo(d);
    if (info.booking) {
      setOpenBooking(info.booking);
      return;
    }
    if (!rangeStart) {
      setRangeStart(d);
      setRangeEnd(d);
      return;
    }
    if (!rangeEnd || !isSameDay(rangeStart, rangeEnd)) {
      setRangeStart(d);
      setRangeEnd(d);
      return;
    }
    setRangeEnd(d);
  }

  const orderedRange = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    return rangeStart <= rangeEnd
      ? ([rangeStart, rangeEnd] as const)
      : ([rangeEnd, rangeStart] as const);
  }, [rangeStart, rangeEnd]);

  // Check if EVERY day in range is currently blocked
  const rangeFullyBlocked = useMemo(() => {
    if (!orderedRange) return false;
    const [a, b] = orderedRange;
    const span = eachDayOfInterval({ start: a, end: b });
    return span.every((d) =>
      blocks.some((blk) =>
        isWithinInterval(d, { start: parseISO(blk.start_date), end: parseISO(blk.end_date) }),
      ),
    );
  }, [orderedRange, blocks]);

  async function blockRange() {
    if (!orderedRange || !roomId) return;
    const [a, b] = orderedRange;
    const { error } = await supabase.from("room_blocks").insert({
      room_id: roomId,
      start_date: format(a, "yyyy-MM-dd"),
      end_date: format(b, "yyyy-MM-dd"),
      reason: "Manual block",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dates blocked");
    setRangeStart(null);
    setRangeEnd(null);
    qc.invalidateQueries({ queryKey: ["room-blocks", roomId] });
  }

  async function unblockRange() {
    if (!orderedRange || !roomId) return;
    const [a, b] = orderedRange;
    // Find all blocks overlapping the selected range
    const overlapping = blocks.filter((blk) => {
      const bs = parseISO(blk.start_date),
        be = parseISO(blk.end_date);
      return bs <= b && be >= a;
    });
    try {
      for (const blk of overlapping) {
        const bs = parseISO(blk.start_date),
          be = parseISO(blk.end_date);
        // Delete original
        const { error: delErr } = await supabase.from("room_blocks").delete().eq("id", blk.id);
        if (delErr) throw delErr;
        // Re-insert left remainder
        if (bs < a) {
          const leftEnd = addDays(a, -1);
          if (differenceInCalendarDays(leftEnd, bs) >= 0) {
            const { error } = await supabase.from("room_blocks").insert({
              room_id: roomId,
              start_date: format(bs, "yyyy-MM-dd"),
              end_date: format(leftEnd, "yyyy-MM-dd"),
              reason: blk.reason,
            });
            if (error) throw error;
          }
        }
        // Re-insert right remainder
        if (be > b) {
          const rightStart = addDays(b, 1);
          if (differenceInCalendarDays(be, rightStart) >= 0) {
            const { error } = await supabase.from("room_blocks").insert({
              room_id: roomId,
              start_date: format(rightStart, "yyyy-MM-dd"),
              end_date: format(be, "yyyy-MM-dd"),
              reason: blk.reason,
            });
            if (error) throw error;
          }
        }
      }
      toast.success("Dates unblocked");
      setRangeStart(null);
      setRangeEnd(null);
      qc.invalidateQueries({ queryKey: ["room-blocks", roomId] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Unblock failed");
    }
  }

  if (!rooms.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Add a room first to manage availability.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <RoomThumb url={room?.thumbnail_url ?? null} />
        <div className="flex-1">
          <Label>Room</Label>
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (${r.price}/night)
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="font-semibold min-w-[10rem] text-center">
            {format(month, "MMMM yyyy")}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
          Today
        </Button>
      </Card>

      <Card className="p-5">
        <div className="grid grid-cols-7 gap-1 mb-2 text-[10px] text-muted-foreground uppercase">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`b${i}`} />
          ))}
          {days.map((d) => {
            const info = dayInfo(d);
            const selected = inRange(d);
            const past = isBefore(d, startOfMonth(new Date())) && !isSameDay(d, today);
            const isToday = isSameDay(d, today);
            let cls = "bg-emerald-500/10 hover:bg-emerald-500/25 text-foreground";
            let title = "Available";
            if (info.booking) {
              cls = "bg-destructive/25 hover:bg-destructive/40 text-foreground";
              title = `Booked: ${info.booking.guest?.name ?? ""} (${info.booking.status})`;
            } else if (info.block) {
              cls = "bg-muted text-muted-foreground hover:bg-muted/70";
              title = "Blocked";
            }
            if (selected && !info.booking) cls = "bg-primary text-primary-foreground";
            if (past) cls += " opacity-50";
            const todayRing = isToday
              ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-background shadow-lg shadow-amber-400/20 font-bold"
              : "";
            return (
              <button
                key={info.dStr}
                title={title}
                onClick={() => onClickDay(d)}
                className={`min-h-[80px] p-1.5 rounded-md text-left transition-colors flex flex-col gap-0.5 ${cls} ${todayRing}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${isToday ? "font-extrabold" : "font-semibold"}`}>
                    {format(d, "d")}
                  </span>
                  {isToday && (
                    <span className="text-[8px] uppercase tracking-wider bg-amber-400 text-amber-950 px-1 rounded">
                      Today
                    </span>
                  )}
                </div>
                {info.booking ? (
                  <div className="text-[10px] leading-tight overflow-hidden">
                    <div className="font-semibold truncate">
                      {info.booking.guest?.name ?? "Guest"}
                    </div>
                    <div className="opacity-75 truncate">{info.booking.status}</div>
                    <div className="opacity-75 truncate">👥 {info.booking.num_guests ?? 1}</div>
                  </div>
                ) : info.block ? (
                  <span className="text-[10px] opacity-80">Blocked</span>
                ) : (
                  <span className="text-[10px] opacity-60">Available</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-emerald-500/30 rounded" /> Available
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-muted rounded" /> Blocked
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-destructive/40 rounded" /> Booked
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-primary rounded" /> Selected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded ring-2 ring-amber-400" /> Today
          </span>
          <span className="text-muted-foreground ml-auto">
            Click a date, then a second to select a range. Click a booked day to view details.
          </span>
        </div>
      </Card>

      {orderedRange && (
        <Card className="p-5 border-primary/40">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">
              Selected: {format(orderedRange[0], "MMM d")} –{" "}
              {format(orderedRange[1], "MMM d, yyyy")}
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRangeStart(null);
                setRangeEnd(null);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {rangeFullyBlocked ? (
              <Button variant="outline" onClick={unblockRange}>
                Unblock dates
              </Button>
            ) : (
              <Button onClick={blockRange}>Block dates</Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {rangeFullyBlocked
              ? "These dates are currently blocked. Unblocking only removes the block from this selection."
              : "Block these dates to prevent new bookings during this range."}
          </p>
        </Card>
      )}

      <Drawer open={!!openBooking} onClose={() => setOpenBooking(null)} title="Booking details">
        {openBooking && <BookingDetails booking={openBooking} />}
      </Drawer>
    </div>
  );
}

function RoomThumb({ url }: { url: string | null }) {
  const signed = useSignedImage("room-images", url);
  return (
    <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
      {signed && <img src={signed} alt="" className="w-full h-full object-cover" />}
    </div>
  );
}

function BookingDetails({ booking }: { booking: Booking }) {
  const statusVariant: Record<string, "success" | "warning" | "danger" | "muted"> = {
    upcoming: "warning",
    confirmed: "success",
    completed: "muted",
    cancelled: "danger",
    pending: "warning",
    checked_in: "success",
  };
  const nights = differenceInCalendarDays(parseISO(booking.check_out), parseISO(booking.check_in));
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant[booking.status] ?? "default"}>{booking.status}</Badge>
        <span className="text-xs text-muted-foreground">#{booking.id.slice(0, 8)}</span>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Guest</div>
        <div className="font-semibold">{booking.guest?.name ?? "—"}</div>
        {booking.guest?.phone && (
          <div className="text-xs text-muted-foreground">{booking.guest.phone}</div>
        )}
        {booking.guest?.email && (
          <div className="text-xs text-muted-foreground">{booking.guest.email}</div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Check-in</div>
          <div className="font-medium">
            {format(parseISO(booking.check_in), "EEE, MMM d, yyyy")}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Check-out</div>
          <div className="font-medium">
            {format(parseISO(booking.check_out), "EEE, MMM d, yyyy")}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Nights</div>
          <div className="font-medium">{nights}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Guests</div>
          <div className="font-medium">{booking.num_guests ?? 1}</div>
        </div>
      </div>
      {booking.total_price != null && (
        <div>
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="font-semibold">${booking.total_price}</div>
        </div>
      )}
      {booking.notes && (
        <div>
          <div className="text-xs text-muted-foreground">Notes</div>
          <p className="whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}
      <a href={`/bookings`} className="text-xs text-primary hover:underline">
        Manage in Bookings →
      </a>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button } from "@/components/admin/ui";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isWithinInterval, addDays } from "date-fns";

export const Route = createFileRoute("/_authenticated/rooms/$id/calendar")({
  component: RoomCalendar,
});

type Block = { id: string; start_date: string; end_date: string; reason: string | null };
type Booking = { id: string; check_in: string; check_out: string; status: string; guest: { name: string } | null };

function RoomCalendar() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);

  const { data: room } = useQuery({
    queryKey: ["room", id],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name").eq("id", id).single();
      return data;
    },
  });

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const { data: blocks = [] } = useQuery({
    queryKey: ["room-blocks", id, month.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_blocks").select("*")
        .eq("room_id", id)
        .gte("end_date", monthStart.toISOString().slice(0, 10))
        .lte("start_date", monthEnd.toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []) as Block[];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["room-bookings", id, month.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select("id, check_in, check_out, status, guest:guests(name)")
        .eq("room_id", id)
        .in("status", ["upcoming", "confirmed", "pending", "checked_in"])
        .gte("check_out", monthStart.toISOString().slice(0, 10))
        .lte("check_in", monthEnd.toISOString().slice(0, 10));
      if (error) throw error;
      return (data ?? []) as unknown as Booking[];
    },
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  function dayInfo(d: Date) {
    const dStr = format(d, "yyyy-MM-dd");
    const booking = bookings.find((b) => {
      const ci = new Date(b.check_in + "T00:00:00");
      const co = new Date(b.check_out + "T00:00:00");
      return d >= ci && d < co;
    });
    const block = blocks.find((b) => {
      return isWithinInterval(d, { start: new Date(b.start_date + "T00:00:00"), end: new Date(b.end_date + "T00:00:00") });
    });
    return { dStr, booking, block };
  }

  function inRange(d: Date) {
    if (!rangeStart) return false;
    const end = rangeEnd ?? rangeStart;
    const [a, b] = rangeStart <= end ? [rangeStart, end] : [end, rangeStart];
    return d >= a && d <= b;
  }

  function onClickDay(d: Date, info: ReturnType<typeof dayInfo>) {
    if (info.booking) return;
    if (info.block) {
      if (!confirm("Unblock these dates?")) return;
      supabase.from("room_blocks").delete().eq("id", info.block.id).then(() => {
        qc.invalidateQueries({ queryKey: ["room-blocks", id] });
        toast.success("Unblocked");
      });
      return;
    }
    if (!rangeStart) { setRangeStart(d); setRangeEnd(d); return; }
    if (!rangeEnd || !isSameDay(rangeStart, rangeEnd)) { setRangeStart(d); setRangeEnd(d); return; }
    setRangeEnd(d);
  }

  async function blockRange() {
    if (!rangeStart || !rangeEnd) return;
    const [a, b] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    const { error } = await supabase.from("room_blocks").insert({
      room_id: id,
      start_date: format(a, "yyyy-MM-dd"),
      end_date: format(b, "yyyy-MM-dd"),
      reason: "Manual block",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Dates blocked");
    setRangeStart(null); setRangeEnd(null);
    qc.invalidateQueries({ queryKey: ["room-blocks", id] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/rooms" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="w-4 h-4" /> Back to rooms
        </Link>
        <h2 className="text-lg font-semibold">{room?.name ?? "Room"} availability</h2>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="font-semibold">{format(month, "MMMM yyyy")}</div>
          <Button variant="ghost" size="sm" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2 text-[10px] text-muted-foreground uppercase">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="text-center">{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
          {days.map((d) => {
            const info = dayInfo(d);
            const selected = inRange(d);
            let cls = "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25";
            let title = "Available";
            if (info.booking) { cls = "bg-destructive/30 text-destructive-foreground cursor-not-allowed"; title = `Booked: ${info.booking.guest?.name ?? ""}`; }
            else if (info.block) { cls = "bg-muted text-muted-foreground hover:bg-muted/70"; title = "Blocked — click to unblock"; }
            if (selected && !info.booking) cls = "bg-primary text-primary-foreground";
            return (
              <button key={info.dStr} title={title} onClick={() => onClickDay(d, info)}
                className={`aspect-square rounded-md text-sm font-medium transition-colors ${cls}`}>
                {format(d, "d")}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500/40 rounded" /> Available</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-muted rounded" /> Blocked</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-destructive/40 rounded" /> Booked</span>
          </div>
          {rangeStart && rangeEnd && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {format(rangeStart <= rangeEnd ? rangeStart : rangeEnd, "MMM d")} – {format(rangeStart <= rangeEnd ? rangeEnd : rangeStart, "MMM d")}
              </span>
              <Button size="sm" onClick={blockRange}>Block dates</Button>
              <Button size="sm" variant="ghost" onClick={() => { setRangeStart(null); setRangeEnd(null); }}>Clear</Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Upcoming bookings ({bookings.length})</h3>
        {bookings.length === 0 ? <p className="text-xs text-muted-foreground">No bookings this month.</p> : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex justify-between text-sm bg-muted/30 rounded-md p-3">
                <span>{b.guest?.name ?? "—"}</span>
                <span className="text-muted-foreground">{format(new Date(b.check_in), "MMM d")} → {format(addDays(new Date(b.check_out), -1), "MMM d")}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

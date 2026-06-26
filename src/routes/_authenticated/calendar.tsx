import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Select, Label } from "@/components/admin/ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameDay, isWithinInterval, isBefore, parseISO,
} from "date-fns";

const searchSchema = z.object({ roomId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/calendar")({
  validateSearch: searchSchema,
  component: CalendarPage,
});

type Block = { id: string; start_date: string; end_date: string; reason: string | null };
type Booking = { id: string; check_in: string; check_out: string; status: string; guest: { name: string } | null };
type Pricing = { id: string; start_date: string; end_date: string; price_per_night: number; label: string | null; priority: number };

function CalendarPage() {
  const search = useSearch({ from: "/_authenticated/calendar" });
  const qc = useQueryClient();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [roomId, setRoomId] = useState<string>(search.roomId ?? "");
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [editingDay, setEditingDay] = useState<Date | null>(null);

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms-min"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name, price").order("name");
      return (data ?? []) as { id: string; name: string; price: number }[];
    },
  });

  // Default to first room
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
      const { data, error } = await supabase.from("room_blocks").select("*")
        .eq("room_id", roomId).gte("end_date", startStr).lte("start_date", endStr);
      if (error) throw error;
      return (data ?? []) as Block[];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["room-bookings", roomId, startStr],
    enabled: !!roomId,
    queryFn: async () => {
      const [legacy, joined] = await Promise.all([
        supabase.from("bookings").select("id, check_in, check_out, status, guest:guests(name)")
          .eq("room_id", roomId).in("status", ["upcoming","confirmed","pending","checked_in"])
          .gte("check_out", startStr).lte("check_in", endStr),
        supabase.from("booking_rooms").select("booking:bookings(id, check_in, check_out, status, guest:guests(name))")
          .eq("room_id", roomId),
      ]);
      const out: Booking[] = [];
      (legacy.data ?? []).forEach((b) => out.push(b as unknown as Booking));
      (joined.data ?? []).forEach((j) => {
        const b = (j as { booking: Booking | null }).booking;
        if (b && ["upcoming","confirmed","pending","checked_in"].includes(b.status)
          && b.check_out >= startStr && b.check_in <= endStr
          && !out.some((x) => x.id === b.id)) out.push(b);
      });
      return out;
    },
  });

  const { data: pricing = [] } = useQuery({
    queryKey: ["room-pricing", roomId],
    enabled: !!roomId,
    queryFn: async () => {
      const { data, error } = await supabase.from("room_pricing").select("*")
        .eq("room_id", roomId).order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pricing[];
    },
  });

  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = getDay(monthStart);

  function priceForDay(d: Date): { price: number; rule: Pricing | null } {
    if (!room) return { price: 0, rule: null };
    for (const p of pricing) {
      const s = parseISO(p.start_date), e = parseISO(p.end_date);
      if (isWithinInterval(d, { start: s, end: e })) return { price: Number(p.price_per_night), rule: p };
    }
    return { price: Number(room.price), rule: null };
  }

  function dayInfo(d: Date) {
    const dStr = format(d, "yyyy-MM-dd");
    const booking = bookings.find((b) => {
      const ci = parseISO(b.check_in), co = parseISO(b.check_out);
      return d >= ci && d < co;
    });
    const block = blocks.find((b) =>
      isWithinInterval(d, { start: parseISO(b.start_date), end: parseISO(b.end_date) }));
    return { dStr, booking, block, ...priceForDay(d) };
  }

  function inRange(d: Date) {
    if (!rangeStart) return false;
    const end = rangeEnd ?? rangeStart;
    const [a, b] = rangeStart <= end ? [rangeStart, end] : [end, rangeStart];
    return d >= a && d <= b;
  }

  function onClickDay(d: Date) {
    const info = dayInfo(d);
    if (info.booking) { toast.message(`Booked: ${info.booking.guest?.name ?? ""}`); return; }
    if (!rangeStart) { setRangeStart(d); setRangeEnd(d); return; }
    if (rangeStart && rangeEnd && isSameDay(rangeStart, rangeEnd) && isSameDay(rangeStart, d)) {
      // Same single day click — open editor
      setEditingDay(d); setRangeStart(null); setRangeEnd(null); return;
    }
    if (!rangeEnd || !isSameDay(rangeStart, rangeEnd)) { setRangeStart(d); setRangeEnd(d); return; }
    setRangeEnd(d);
  }

  const orderedRange = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    return rangeStart <= rangeEnd ? [rangeStart, rangeEnd] as const : [rangeEnd, rangeStart] as const;
  }, [rangeStart, rangeEnd]);

  async function blockRange() {
    if (!orderedRange || !roomId) return;
    const [a, b] = orderedRange;
    const { error } = await supabase.from("room_blocks").insert({
      room_id: roomId, start_date: format(a, "yyyy-MM-dd"), end_date: format(b, "yyyy-MM-dd"), reason: "Manual block",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Dates blocked");
    setRangeStart(null); setRangeEnd(null);
    qc.invalidateQueries({ queryKey: ["room-blocks", roomId] });
  }

  async function unblockBlock(id: string) {
    const { error } = await supabase.from("room_blocks").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Unblocked");
    qc.invalidateQueries({ queryKey: ["room-blocks", roomId] });
  }

  async function setRangePrice(price: number, label: string) {
    if (!orderedRange || !roomId) return;
    const [a, b] = orderedRange;
    const { error } = await supabase.from("room_pricing").insert({
      room_id: roomId, start_date: format(a, "yyyy-MM-dd"), end_date: format(b, "yyyy-MM-dd"),
      price_per_night: price, label, priority: isSameDay(a, b) ? 100 : 10,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Pricing rule added");
    setRangeStart(null); setRangeEnd(null);
    qc.invalidateQueries({ queryKey: ["room-pricing", roomId] });
  }

  async function deletePricing(id: string) {
    const { error } = await supabase.from("room_pricing").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["room-pricing", roomId] });
  }

  if (!rooms.length) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Add a room first to manage availability and pricing.</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="flex-1">
          <Label>Room</Label>
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} (base ${r.price}/night)</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="w-4 h-4" /></Button>
          <div className="font-semibold min-w-[10rem] text-center">{format(month, "MMMM yyyy")}</div>
          <Button variant="ghost" size="sm" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
      </Card>

      <Card className="p-5">
        <div className="grid grid-cols-7 gap-1 mb-2 text-[10px] text-muted-foreground uppercase">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
          {days.map((d) => {
            const info = dayInfo(d);
            const selected = inRange(d);
            const past = isBefore(d, startOfMonth(new Date())) && !isSameDay(d, new Date());
            let cls = "bg-emerald-500/10 hover:bg-emerald-500/25 text-foreground";
            let title = `Available — $${info.price}/night`;
            if (info.booking) { cls = "bg-destructive/30 text-destructive-foreground cursor-not-allowed"; title = `Booked: ${info.booking.guest?.name ?? ""}`; }
            else if (info.block) { cls = "bg-muted text-muted-foreground hover:bg-muted/70"; title = "Blocked"; }
            if (selected && !info.booking) cls = "bg-primary text-primary-foreground";
            if (past) cls += " opacity-50";
            return (
              <button key={info.dStr} title={title} onClick={() => onClickDay(d)}
                className={`min-h-[64px] p-1.5 rounded-md text-left transition-colors flex flex-col justify-between ${cls}`}>
                <span className="text-sm font-semibold">{format(d, "d")}</span>
                <span className="text-[10px] opacity-80">
                  {info.booking ? "Booked" : info.block ? "Blocked" : `$${info.price}`}
                </span>
                {info.rule && !info.booking && !info.block && (
                  <span className="text-[9px] opacity-70 truncate">{info.rule.label ?? "Special"}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500/30 rounded" /> Available</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-muted rounded" /> Blocked</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-destructive/40 rounded" /> Booked</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-primary rounded" /> Selected</span>
          <span className="text-muted-foreground ml-auto">Click a date then a second date to select a range, or click the same day twice to edit it.</span>
        </div>
      </Card>

      {orderedRange && (
        <RangeActionsCard
          range={orderedRange}
          basePrice={room?.price ?? 0}
          onBlock={blockRange}
          onSetPrice={setRangePrice}
          onClear={() => { setRangeStart(null); setRangeEnd(null); }}
        />
      )}

      {editingDay && (
        <DayEditor
          day={editingDay}
          info={dayInfo(editingDay)}
          basePrice={room?.price ?? 0}
          onUnblock={unblockBlock}
          onSetPrice={(price, label) => {
            setRangeStart(editingDay); setRangeEnd(editingDay);
            setRangePrice(price, label);
            setEditingDay(null);
          }}
          onBlock={() => {
            setRangeStart(editingDay); setRangeEnd(editingDay);
            blockRange();
            setEditingDay(null);
          }}
          onDeletePricing={deletePricing}
          onClose={() => setEditingDay(null)}
        />
      )}

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Pricing rules</h3>
        {pricing.length === 0 ? (
          <p className="text-xs text-muted-foreground">No special pricing rules. The room's base price (${room?.price}/night) applies.</p>
        ) : (
          <div className="space-y-2">
            {pricing.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-muted/40 rounded-md px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{p.label ?? "Special"} — ${p.price_per_night}/night</div>
                  <div className="text-xs text-muted-foreground">{p.start_date} → {p.end_date} (priority {p.priority})</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => deletePricing(p.id)}><X className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Manual blocks</h3>
        {blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No blocks in this month.</p>
        ) : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 bg-muted/40 rounded-md px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{b.start_date} → {b.end_date}</div>
                  <div className="text-xs text-muted-foreground">{b.reason ?? "Blocked"}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => unblockBlock(b.id)}>Unblock</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function RangeActionsCard({
  range, basePrice, onBlock, onSetPrice, onClear,
}: {
  range: readonly [Date, Date]; basePrice: number;
  onBlock: () => void; onSetPrice: (price: number, label: string) => void; onClear: () => void;
}) {
  const [price, setPrice] = useState(String(basePrice));
  const [label, setLabel] = useState("");
  const [a, b] = range;
  return (
    <Card className="p-5 border-primary/40">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Selected: {format(a, "MMM d")} – {format(b, "MMM d, yyyy")}</h3>
        <Button size="sm" variant="ghost" onClick={onClear}><X className="w-4 h-4" /></Button>
      </div>
      <div className="grid sm:grid-cols-3 gap-3 mb-3">
        <div>
          <Label>Price / night</Label>
          <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Label (e.g. "High season")</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="High season / Holiday / Special" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onSetPrice(Number(price), label || "Special")}>Apply price to range</Button>
        <Button variant="outline" onClick={onBlock}>Block dates</Button>
      </div>
    </Card>
  );
}

function DayEditor({
  day, info, basePrice, onUnblock, onSetPrice, onBlock, onDeletePricing, onClose,
}: {
  day: Date;
  info: { booking: Booking | undefined; block: Block | undefined; price: number; rule: Pricing | null };
  basePrice: number;
  onUnblock: (id: string) => void;
  onSetPrice: (price: number, label: string) => void;
  onBlock: () => void;
  onDeletePricing: (id: string) => void;
  onClose: () => void;
}) {
  const [price, setPrice] = useState(String(info.price || basePrice));
  const [label, setLabel] = useState(info.rule?.label ?? "");
  return (
    <Card className="p-5 border-primary/40">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{format(day, "EEEE, MMM d, yyyy")}</h3>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>
      {info.booking ? (
        <p className="text-sm text-muted-foreground">Booked by {info.booking.guest?.name ?? "guest"}.</p>
      ) : (
        <div className="space-y-3">
          {info.block && (
            <div className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2 text-sm">
              <span>Currently blocked</span>
              <Button size="sm" variant="outline" onClick={() => { onUnblock(info.block!.id); onClose(); }}>Unblock</Button>
            </div>
          )}
          {info.rule && (
            <div className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2 text-sm">
              <span>Current rule: {info.rule.label ?? "Special"} — ${info.rule.price_per_night}</span>
              <Button size="sm" variant="ghost" onClick={() => { onDeletePricing(info.rule!.id); onClose(); }}>Remove</Button>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div><Label>Price for this day</Label><Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
            <div><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Special" /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onSetPrice(Number(price), label || "Special")}>Set price</Button>
            {!info.block && <Button variant="outline" onClick={onBlock}>Block this day</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}

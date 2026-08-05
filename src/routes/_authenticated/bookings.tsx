import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { format, isToday, parseISO } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Select, Label, Drawer, Empty, Textarea } from "@/components/admin/ui";
import { Plus, Search, Download, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import {
  StatusPill,
  ALL_STATUSES,
  STATUS_LABEL,
  STATUS_CLASSES,
  normalizeStatus,
  type BookingStatus,
} from "@/lib/booking-status";

export const Route = createFileRoute("/_authenticated/bookings")({
  component: BookingsPage,
});

type BookedRoom = { id: string; room_id: string; price_per_night: number | null; room: { id: string; name: string; price: number } | null };

type BookingRow = {
  id: string; check_in: string; check_out: string; status: string;
  notes: string | null; admin_notes: string | null; arrival_time: string | null;
  total_price: number | null; created_at: string;
  guest_id: string | null; room_id: string | null; num_guests: number | null;
  guest: { id: string; name: string; phone: string | null; email: string | null } | null;
  room: { id: string; name: string; price: number } | null;
  booking_rooms: BookedRoom[];
};

const QUICK_FILTERS = [
  { id: "today_checkin",  label: "Today's Check-ins"  },
  { id: "today_checkout", label: "Today's Check-outs" },
  { id: "current",        label: "Current Guests"     },
  { id: "future",         label: "Future Bookings"    },
  { id: "cancelled",      label: "Cancelled"          },
] as const;
type QuickFilterId = (typeof QUICK_FILTERS)[number]["id"] | "";

function nightsBetween(ci: string, co: string) {
  return Math.max(0, Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000));
}

function roomsLabel(b: BookingRow) {
  const names = b.booking_rooms?.map((br) => br.room?.name).filter(Boolean) as string[];
  if (names && names.length) return names.join(", ");
  return b.room?.name ?? "—";
}

function roomIds(b: BookingRow): string[] {
  if (b.booking_rooms?.length) return b.booking_rooms.map((br) => br.room_id);
  if (b.room_id) return [b.room_id];
  return [];
}

// ─── Main page ───────────────────────────────────────────────────────────────

function BookingsPage() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  // ── filter state ──
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [quickFilter, setQuickFilter]   = useState<QuickFilterId>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ciFrom, setCiFrom]             = useState("");
  const [ciTo, setCiTo]                 = useState("");
  const [coFrom, setCoFrom]             = useState("");
  const [coTo, setCoTo]                 = useState("");
  const [bdFrom, setBdFrom]             = useState("");
  const [bdTo, setBdTo]                 = useState("");
  const [nightsMin, setNightsMin]       = useState("");
  const [nightsMax, setNightsMax]       = useState("");
  const [guestsMin, setGuestsMin]       = useState("");
  const [guestsMax, setGuestsMax]       = useState("");
  const [roomFilter, setRoomFilter]     = useState("");

  // ── drawer state ──
  const [selected, setSelected] = useState<BookingRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, check_in, check_out, status, notes, admin_notes, arrival_time, total_price, created_at, guest_id, room_id, num_guests, guest:guests(id, name, phone, email), room:rooms(id, name, price), booking_rooms(id, room_id, price_per_night, room:rooms(id, name, price))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BookingRow[];
    },
  });

  const { data: allRooms = [] } = useQuery({
    queryKey: ["rooms-min"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // ── filtering ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return bookings.filter((b) => {
      // quick filter
      if (quickFilter === "today_checkin")  { if (b.check_in  !== today) return false; }
      if (quickFilter === "today_checkout") { if (b.check_out !== today) return false; }
      if (quickFilter === "current")        { if (normalizeStatus(b.status) !== "checked_in") return false; }
      if (quickFilter === "future")         { if (b.check_in <= today) return false; }
      if (quickFilter === "cancelled")      { if (normalizeStatus(b.status) !== "cancelled") return false; }

      // status
      if (statusFilter && normalizeStatus(b.status) !== statusFilter) return false;

      // text search
      if (q) {
        const match =
          b.id.toLowerCase().includes(q) ||
          b.guest?.name?.toLowerCase().includes(q) ||
          b.guest?.phone?.toLowerCase().includes(q) ||
          b.guest?.email?.toLowerCase().includes(q);
        if (!match) return false;
      }

      // check-in date range
      if (ciFrom && b.check_in < ciFrom) return false;
      if (ciTo   && b.check_in > ciTo)   return false;

      // check-out date range
      if (coFrom && b.check_out < coFrom) return false;
      if (coTo   && b.check_out > coTo)   return false;

      // booking date range
      const bd = b.created_at.slice(0, 10);
      if (bdFrom && bd < bdFrom) return false;
      if (bdTo   && bd > bdTo)   return false;

      // nights
      const nights = nightsBetween(b.check_in, b.check_out);
      if (nightsMin && nights < Number(nightsMin)) return false;
      if (nightsMax && nights > Number(nightsMax)) return false;

      // num guests
      const ng = b.num_guests ?? 0;
      if (guestsMin && ng < Number(guestsMin)) return false;
      if (guestsMax && ng > Number(guestsMax)) return false;

      // room
      if (roomFilter && !roomIds(b).includes(roomFilter)) return false;

      return true;
    });
  }, [bookings, search, statusFilter, quickFilter, ciFrom, ciTo, coFrom, coTo, bdFrom, bdTo, nightsMin, nightsMax, guestsMin, guestsMax, roomFilter, today]);

  const activeAdvancedCount = [ciFrom, ciTo, coFrom, coTo, bdFrom, bdTo, nightsMin, nightsMax, guestsMin, guestsMax, roomFilter]
    .filter(Boolean).length;

  function clearAll() {
    setSearch(""); setStatusFilter(""); setQuickFilter("");
    setCiFrom(""); setCiTo(""); setCoFrom(""); setCoTo("");
    setBdFrom(""); setBdTo(""); setNightsMin(""); setNightsMax("");
    setGuestsMin(""); setGuestsMax(""); setRoomFilter("");
  }

  const hasFilters = !!(search || statusFilter || quickFilter || activeAdvancedCount);

  function exportCsv() {
    const headers = ["id", "guest", "phone", "rooms", "check_in", "check_out", "nights", "status", "total"];
    const rows = filtered.map((b) => [
      b.id, b.guest?.name ?? "", b.guest?.phone ?? "", roomsLabel(b),
      b.check_in, b.check_out, nightsBetween(b.check_in, b.check_out),
      normalizeStatus(b.status), b.total_price ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `bookings-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function updateStatus(bookingId: string, newStatus: BookingStatus) {
    const { error } = await supabase.from("bookings").update({ status: newStatus }).eq("id", bookingId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status → ${STATUS_LABEL[newStatus]}`);
    await qc.invalidateQueries({ queryKey: ["bookings"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-booking-stats"] });
    await qc.invalidateQueries({ queryKey: ["recent-bookings"] });
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["bookings"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-booking-stats"] });
    await qc.invalidateQueries({ queryKey: ["recent-bookings"] });
  }

  return (
    <div className="space-y-3">
      {/* ── Top bar ── */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by guest, phone, email, booking ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-44">
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Button
          variant="outline"
          onClick={() => setShowAdvanced((v) => !v)}
          className={activeAdvancedCount ? "border-primary text-primary" : ""}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters{activeAdvancedCount ? ` (${activeAdvancedCount})` : ""}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
        </Button>
        <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4" />Export</Button>
        <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" />New booking</Button>
      </div>

      {/* ── Quick filters ── */}
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((qf) => (
          <button
            key={qf.id}
            onClick={() => setQuickFilter(quickFilter === qf.id ? "" : qf.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              quickFilter === qf.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {qf.label}
          </button>
        ))}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="px-3 py-1 rounded-full text-xs font-medium border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive flex items-center gap-1"
          >
            <X className="w-3 h-3" />Clear all
          </button>
        )}
      </div>

      {/* ── Advanced filter panel ── */}
      {showAdvanced && (
        <Card className="p-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            {/* Check-in range */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Check-in date</p>
              <div className="flex items-center gap-1.5">
                <Input type="date" value={ciFrom} onChange={(e) => setCiFrom(e.target.value)} className="text-sm" />
                <span className="text-muted-foreground text-xs shrink-0">to</span>
                <Input type="date" value={ciTo}   onChange={(e) => setCiTo(e.target.value)}   className="text-sm" />
              </div>
            </div>

            {/* Check-out range */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Check-out date</p>
              <div className="flex items-center gap-1.5">
                <Input type="date" value={coFrom} onChange={(e) => setCoFrom(e.target.value)} className="text-sm" />
                <span className="text-muted-foreground text-xs shrink-0">to</span>
                <Input type="date" value={coTo}   onChange={(e) => setCoTo(e.target.value)}   className="text-sm" />
              </div>
            </div>

            {/* Booking date range */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Booking date</p>
              <div className="flex items-center gap-1.5">
                <Input type="date" value={bdFrom} onChange={(e) => setBdFrom(e.target.value)} className="text-sm" />
                <span className="text-muted-foreground text-xs shrink-0">to</span>
                <Input type="date" value={bdTo}   onChange={(e) => setBdTo(e.target.value)}   className="text-sm" />
              </div>
            </div>

            {/* Nights */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Nights</p>
              <div className="flex items-center gap-1.5">
                <Input type="number" min="0" placeholder="Min" value={nightsMin} onChange={(e) => setNightsMin(e.target.value)} className="text-sm" />
                <span className="text-muted-foreground text-xs shrink-0">–</span>
                <Input type="number" min="0" placeholder="Max" value={nightsMax} onChange={(e) => setNightsMax(e.target.value)} className="text-sm" />
              </div>
            </div>

            {/* Guests */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Number of guests</p>
              <div className="flex items-center gap-1.5">
                <Input type="number" min="1" placeholder="Min" value={guestsMin} onChange={(e) => setGuestsMin(e.target.value)} className="text-sm" />
                <span className="text-muted-foreground text-xs shrink-0">–</span>
                <Input type="number" min="1" placeholder="Max" value={guestsMax} onChange={(e) => setGuestsMax(e.target.value)} className="text-sm" />
              </div>
            </div>

            {/* Room */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Room</p>
              <Select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="text-sm w-full">
                <option value="">All rooms</option>
                {allRooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
          </div>
        </Card>
      )}

      {/* ── Result count ── */}
      <div className="text-xs text-muted-foreground">
        {hasFilters
          ? `${filtered.length} of ${bookings.length} booking${bookings.length !== 1 ? "s" : ""}`
          : `${bookings.length} booking${bookings.length !== 1 ? "s" : ""}`}
      </div>

      {/* ── Table ── */}
      <Card>
        {filtered.length === 0 ? <Empty title="No bookings match your filters" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Booking ID</th>
                  <th className="px-4 py-3 font-medium">Guest</th>
                  <th className="px-4 py-3 font-medium">Rooms</th>
                  <th className="px-4 py-3 font-medium">Check-in</th>
                  <th className="px-4 py-3 font-medium">Check-out</th>
                  <th className="px-4 py-3 font-medium text-right">Nights</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => setSelected(b)}
                    className="border-b border-border/50 last:border-0 hover:bg-accent/40 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.guest?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{b.guest?.phone ?? b.guest?.email ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{roomsLabel(b)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(parseISO(b.check_in), "MMM d, yyyy")}
                      {isToday(parseISO(b.check_in)) && <span className="ml-1 text-[10px] text-primary font-medium">Today</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(parseISO(b.check_out), "MMM d, yyyy")}
                      {isToday(parseISO(b.check_out)) && <span className="ml-1 text-[10px] text-primary font-medium">Today</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{nightsBetween(b.check_in, b.check_out)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <InlineStatusSelect
                        bookingId={b.id}
                        current={normalizeStatus(b.status)}
                        onChange={updateStatus}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">{b.total_price ? `$${b.total_price}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Booking details">
        {selected && (
          <BookingForm
            booking={selected}
            onSaved={async () => { await refresh(); setSelected(null); }}
            onCancel={() => setSelected(null)}
            onStatusChange={updateStatus}
          />
        )}
      </Drawer>

      <Drawer open={creating} onClose={() => setCreating(false)} title="New booking">
        <BookingForm
          onSaved={async () => { await refresh(); setCreating(false); }}
          onCancel={() => setCreating(false)}
          onStatusChange={updateStatus}
        />
      </Drawer>
    </div>
  );
}

// ─── Inline status selector in the table row ─────────────────────────────────

function InlineStatusSelect({
  bookingId,
  current,
  onChange,
}: {
  bookingId: string;
  current: BookingStatus;
  onChange: (id: string, s: BookingStatus) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const cls = STATUS_CLASSES[current];
  return (
    <select
      value={current}
      disabled={busy}
      onChange={async (e) => {
        setBusy(true);
        await onChange(bookingId, e.target.value as BookingStatus);
        setBusy(false);
      }}
      className={`text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer appearance-none pr-5 ${cls} ${busy ? "opacity-60" : ""}`}
      style={{ backgroundImage: "none" }}
      title="Change status"
    >
      {ALL_STATUSES.map((s) => (
        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
      ))}
    </select>
  );
}

// ─── Booking form (create / edit) ────────────────────────────────────────────

function BookingForm({
  booking,
  onSaved,
  onCancel,
  onStatusChange,
}: {
  booking?: BookingRow;
  onSaved: () => void;
  onCancel: () => void;
  onStatusChange: (id: string, s: BookingStatus) => Promise<void>;
}) {
  const isEdit = !!booking;
  const [guestName, setGuestName]   = useState(booking?.guest?.name ?? "");
  const [guestPhone, setGuestPhone] = useState(booking?.guest?.phone ?? "");
  const [guestEmail, setGuestEmail] = useState(booking?.guest?.email ?? "");
  const initialRoomIds = useMemo(() => {
    if (booking?.booking_rooms?.length) return booking.booking_rooms.map((br) => br.room_id);
    if (booking?.room_id) return [booking.room_id];
    return [] as string[];
  }, [booking]);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>(initialRoomIds);
  const [checkIn, setCheckIn]         = useState(booking?.check_in ?? "");
  const [checkOut, setCheckOut]       = useState(booking?.check_out ?? "");
  const [arrivalTime, setArrivalTime] = useState(booking?.arrival_time ?? "");
  const [guestRequest]                = useState(booking?.notes ?? "");
  const [adminNotes, setAdminNotes]   = useState(booking?.admin_notes ?? "");
  const [totalPrice, setTotalPrice]   = useState(booking?.total_price?.toString() ?? "");
  const [numGuests, setNumGuests]     = useState(booking?.num_guests?.toString() ?? "1");
  const [status, setStatus]           = useState<BookingStatus>(normalizeStatus(booking?.status));
  const [saving, setSaving]           = useState(false);

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms-min"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name, price").order("name");
      return (data ?? []) as { id: string; name: string; price: number }[];
    },
  });

  // Auto-calc total when rooms/dates change and totalPrice is empty
  useEffect(() => {
    if (totalPrice || !checkIn || !checkOut || !selectedRoomIds.length) return;
    const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
    const sum = selectedRoomIds.reduce((acc, id) => acc + (rooms.find((r) => r.id === id)?.price ?? 0), 0);
    if (sum > 0) setTotalPrice(String(sum * nights));
  }, [selectedRoomIds, checkIn, checkOut, rooms, totalPrice]);

  function toggleRoom(id: string) {
    setSelectedRoomIds((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);
  }

  async function save() {
    if (!guestName || !selectedRoomIds.length || !checkIn || !checkOut) {
      toast.error("Please fill required fields and select at least one room");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      toast.error("Check-out must be after check-in");
      return;
    }
    setSaving(true);
    try {
      // Availability check per room
      for (const rid of selectedRoomIds) {
        const { data: avail, error: aerr } = await supabase.rpc("is_room_available", {
          _room_id: rid, _check_in: checkIn, _check_out: checkOut,
          _exclude_booking: booking?.id ?? undefined,
        });
        if (aerr) throw aerr;
        if (avail === false) {
          const name = rooms.find((r) => r.id === rid)?.name ?? "room";
          toast.error(`${name} is not available for those dates.`);
          setSaving(false); return;
        }
      }

      let gid = booking?.guest_id;
      const guestPayload = { name: guestName, phone: guestPhone || null, email: guestEmail || null };
      if (isEdit && booking?.guest) {
        await supabase.from("guests").update(guestPayload).eq("id", booking.guest.id);
        gid = booking.guest.id;
      } else {
        const { data, error } = await supabase.from("guests").insert(guestPayload).select("id").single();
        if (error) throw error;
        gid = data.id;
      }

      const payload = {
        guest_id: gid!,
        room_id: selectedRoomIds[0],
        check_in: checkIn,
        check_out: checkOut,
        arrival_time: arrivalTime || null,
        status: status as string,
        admin_notes: adminNotes || null,
        total_price: totalPrice ? Number(totalPrice) : null,
        num_guests: Number(numGuests) || 1,
      };

      let bookingId = booking?.id;
      if (isEdit) {
        const { error } = await supabase.from("bookings").update(payload).eq("id", booking!.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("bookings").insert(payload).select("id").single();
        if (error) throw error;
        bookingId = data.id;
      }

      // Replace booking_rooms
      if (bookingId) {
        await supabase.from("booking_rooms").delete().eq("booking_id", bookingId);
        const inserts = selectedRoomIds.map((rid) => ({
          booking_id: bookingId!,
          room_id: rid,
          price_per_night: rooms.find((r) => r.id === rid)?.price ?? null,
        }));
        if (inserts.length) {
          const { error } = await supabase.from("booking_rooms").insert(inserts);
          if (error) throw error;
        }
      }

      toast.success(isEdit ? "Booking updated" : "Booking created");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBooking() {
    if (!booking) return;
    if (!confirm("Permanently delete this booking?")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", booking.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Booking deleted");
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div><Label>Guest name *</Label><Input value={guestName} onChange={(e) => setGuestName(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Phone</Label><Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} /></div>
      </div>
      <div>
        <Label>Rooms * (select one or more)</Label>
        <div className="border border-border rounded-md max-h-48 overflow-y-auto divide-y divide-border">
          {rooms.length === 0 && <div className="p-3 text-xs text-muted-foreground">No rooms yet.</div>}
          {rooms.map((r) => (
            <label key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-accent cursor-pointer">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={selectedRoomIds.includes(r.id)} onChange={() => toggleRoom(r.id)} className="accent-[color:var(--primary)]" />
                {r.name}
              </span>
              <span className="text-xs text-muted-foreground">${r.price}/night</span>
            </label>
          ))}
        </div>
        {selectedRoomIds.length > 1 && <div className="text-[10px] text-muted-foreground mt-1">{selectedRoomIds.length} rooms selected</div>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Check-in *</Label><Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
        <div><Label>Check-out *</Label><Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
        <div><Label>Arrival time</Label><Input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} /></div>
      </div>
      {checkIn && checkOut && new Date(checkOut) > new Date(checkIn) && (
        <div className="text-xs text-muted-foreground">
          Duration: <span className="text-foreground font-medium">{Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)} night(s)</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Guests</Label><Input type="number" min="1" value={numGuests} onChange={(e) => setNumGuests(e.target.value)} /></div>
        <div><Label>Total price</Label><Input type="number" step="0.01" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} /></div>
      </div>

      {/* ── Manual status ── */}
      <div>
        <Label>Booking status</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                status === s
                  ? `${STATUS_CLASSES[s]} ring-1 ring-offset-1 ring-primary/40`
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                s === "pending"     ? "bg-yellow-500" :
                s === "confirmed"   ? "bg-sky-400"    :
                s === "upcoming"    ? "bg-blue-400"   :
                s === "checked_in"  ? "bg-emerald-400":
                s === "checked_out" ? "bg-muted-foreground" :
                s === "cancelled"   ? "bg-red-400"    :
                                      "bg-orange-400"
              }`} />
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {isEdit && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Status is saved when you click "Save changes". Or change it instantly from the bookings table.
          </p>
        )}
      </div>

      <div>
        <Label>Guest special request (read-only)</Label>
        <Textarea rows={2} value={guestRequest} readOnly disabled placeholder="No special request from guest" className="opacity-80" />
        <div className="text-[10px] text-muted-foreground mt-1">Submitted by the guest during booking. Not editable.</div>
      </div>
      <div>
        <Label>Admin notes (internal)</Label>
        <Textarea rows={3} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Internal notes — never shown to the guest" />
      </div>

      <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save changes" : "Create booking"}</Button>
        <Button variant="ghost" onClick={onCancel}>Close</Button>
        {isEdit && <Button variant="danger" onClick={deleteBooking}>Delete</Button>}
      </div>
    </div>
  );
}

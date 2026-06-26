import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Select, Label, Drawer, Empty, Badge, Textarea } from "@/components/admin/ui";
import { Plus, Search, Download, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bookings")({
  component: BookingsPage,
});

type BookedRoom = { id: string; room_id: string; price_per_night: number | null; room: { id: string; name: string; price: number } | null };

type BookingRow = {
  id: string; check_in: string; check_out: string; status: string;
  notes: string | null; total_price: number | null; created_at: string;
  guest_id: string | null; room_id: string | null;
  guest: { id: string; name: string; phone: string | null; email: string | null } | null;
  room: { id: string; name: string; price: number } | null;
  booking_rooms: BookedRoom[];
};

function BookingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<BookingRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, check_in, check_out, status, notes, total_price, created_at, guest_id, room_id, guest:guests(id, name, phone, email), room:rooms(id, name, price), booking_rooms(id, room_id, price_per_night, room:rooms(id, name, price))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BookingRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return bookings.filter((b) => {
      if (statusFilter && b.status !== statusFilter) return false;
      if (!q) return true;
      return (
        b.id.toLowerCase().includes(q) ||
        b.guest?.name?.toLowerCase().includes(q) ||
        b.guest?.phone?.toLowerCase().includes(q) ||
        b.guest?.email?.toLowerCase().includes(q)
      );
    });
  }, [bookings, search, statusFilter]);

  function roomsLabel(b: BookingRow) {
    const names = b.booking_rooms?.map((br) => br.room?.name).filter(Boolean) as string[];
    if (names && names.length) return names.join(", ");
    return b.room?.name ?? "—";
  }

  function exportCsv() {
    const headers = ["id", "guest", "phone", "rooms", "check_in", "check_out", "status", "total"];
    const rows = filtered.map((b) => [
      b.id, b.guest?.name ?? "", b.guest?.phone ?? "", roomsLabel(b),
      b.check_in, b.check_out, b.status, b.total_price ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bookings-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function refresh() { await qc.invalidateQueries({ queryKey: ["bookings"] }); }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by guest, phone, email, id..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-44">
          <option value="">All statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4" />Export</Button>
        <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" />New booking</Button>
      </div>

      <Card>
        {filtered.length === 0 ? <Empty title="No bookings match your filters" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Guest</th>
                  <th className="px-4 py-3 font-medium">Rooms</th>
                  <th className="px-4 py-3 font-medium">Check-in</th>
                  <th className="px-4 py-3 font-medium">Check-out</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} onClick={() => setSelected(b)} className="border-b border-border/50 last:border-0 hover:bg-accent/40 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.guest?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{b.guest?.phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{roomsLabel(b)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{format(new Date(b.check_in), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{format(new Date(b.check_out), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-right">{b.total_price ? `$${b.total_price}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Booking details">
        {selected && <BookingForm booking={selected} onSaved={async () => { await refresh(); setSelected(null); }} onCancel={() => setSelected(null)} />}
      </Drawer>

      <Drawer open={creating} onClose={() => setCreating(false)} title="New booking">
        <BookingForm onSaved={async () => { await refresh(); setCreating(false); }} onCancel={() => setCreating(false)} />
      </Drawer>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, "success" | "warning" | "danger" | "muted"> = {
    upcoming: "warning", confirmed: "success", completed: "muted", cancelled: "danger",
  };
  return <Badge variant={m[status] ?? "default"}>{status}</Badge>;
}

function BookingForm({ booking, onSaved, onCancel }: { booking?: BookingRow; onSaved: () => void; onCancel: () => void }) {
  const isEdit = !!booking;
  const [guestName, setGuestName] = useState(booking?.guest?.name ?? "");
  const [guestPhone, setGuestPhone] = useState(booking?.guest?.phone ?? "");
  const [guestEmail, setGuestEmail] = useState(booking?.guest?.email ?? "");
  const initialRoomIds = useMemo(() => {
    if (booking?.booking_rooms?.length) return booking.booking_rooms.map((br) => br.room_id);
    if (booking?.room_id) return [booking.room_id];
    return [] as string[];
  }, [booking]);
  const [roomIds, setRoomIds] = useState<string[]>(initialRoomIds);
  const [checkIn, setCheckIn] = useState(booking?.check_in ?? "");
  const [checkOut, setCheckOut] = useState(booking?.check_out ?? "");
  const [status, setStatus] = useState(booking?.status ?? "upcoming");
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [totalPrice, setTotalPrice] = useState(booking?.total_price?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms-min"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name, price").order("name");
      return (data ?? []) as { id: string; name: string; price: number }[];
    },
  });

  // Auto-calc total when rooms/dates change and totalPrice is empty
  useEffect(() => {
    if (totalPrice || !checkIn || !checkOut || !roomIds.length) return;
    const nights = Math.max(1, Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
    const sum = roomIds.reduce((acc, id) => acc + (rooms.find((r) => r.id === id)?.price ?? 0), 0);
    if (sum > 0) setTotalPrice(String(sum * nights));
  }, [roomIds, checkIn, checkOut, rooms, totalPrice]);

  function toggleRoom(id: string) {
    setRoomIds((prev) => prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]);
  }

  async function save() {
    if (!guestName || !roomIds.length || !checkIn || !checkOut) {
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
      for (const rid of roomIds) {
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
      if (isEdit && booking?.guest) {
        await supabase.from("guests").update({ name: guestName, phone: guestPhone || null, email: guestEmail || null }).eq("id", booking.guest.id);
        gid = booking.guest.id;
      } else {
        const { data, error } = await supabase.from("guests").insert({ name: guestName, phone: guestPhone || null, email: guestEmail || null }).select("id").single();
        if (error) throw error;
        gid = data.id;
      }

      const payload = {
        guest_id: gid!, room_id: roomIds[0], // keep legacy for compat
        check_in: checkIn, check_out: checkOut,
        status, notes: notes || null, total_price: totalPrice ? Number(totalPrice) : null,
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
        const inserts = roomIds.map((rid) => ({
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

  async function cancelBooking() {
    if (!booking) return;
    if (!confirm("Cancel this booking?")) return;
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Booking cancelled");
    onSaved();
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
                <input type="checkbox" checked={roomIds.includes(r.id)} onChange={() => toggleRoom(r.id)} className="accent-[color:var(--primary)]" />
                {r.name}
              </span>
              <span className="text-xs text-muted-foreground">${r.price}/night</span>
            </label>
          ))}
        </div>
        {roomIds.length > 1 && <div className="text-[10px] text-muted-foreground mt-1">{roomIds.length} rooms selected</div>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Check-in *</Label><Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
        <div><Label>Check-out *</Label><Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="upcoming">Upcoming</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div><Label>Total price</Label><Input type="number" step="0.01" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} /></div>
      </div>
      <div><Label>Notes</Label><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : isEdit ? "Save changes" : "Create booking"}</Button>
        <Button variant="ghost" onClick={onCancel}>Close</Button>
        {isEdit && status !== "cancelled" && <Button variant="outline" onClick={cancelBooking}><X className="w-4 h-4" />Cancel booking</Button>}
        {isEdit && <Button variant="danger" onClick={deleteBooking}>Delete</Button>}
      </div>
    </div>
  );
}

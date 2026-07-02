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
  notes: string | null; admin_notes: string | null; arrival_time: string | null;
  total_price: number | null; created_at: string;
  guest_id: string | null; room_id: string | null; num_guests: number | null;
  guest: { id: string; name: string; phone: string | null; email: string | null; country: string | null } | null;
  room: { id: string; name: string; price: number } | null;
  booking_rooms: BookedRoom[];
};

const BOOKING_SELECT = "id, check_in, check_out, status, notes, admin_notes, arrival_time, total_price, created_at, guest_id, room_id, num_guests, guest:guests(id, name, phone, email, country), room:rooms(id, name, price), booking_rooms(id, room_id, price_per_night, room:rooms(id, name, price))";

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
        .select(BOOKING_SELECT)
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
                  <th className="px-4 py-3 font-medium">Booking ID</th>
                  <th className="px-4 py-3 font-medium">Guest name</th>
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
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{b.id.slice(0, 8)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{b.guest?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{b.guest?.phone ?? b.guest?.email ?? ""}</div>
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
  const [guestCountry, setGuestCountry] = useState(booking?.guest?.country ?? "");
  const initialRoomIds = useMemo(() => {
    if (booking?.booking_rooms?.length) return booking.booking_rooms.map((br) => br.room_id);
    if (booking?.room_id) return [booking.room_id];
    return [] as string[];
  }, [booking]);
  const [roomIds, setRoomIds] = useState<string[]>(initialRoomIds);
  const [checkIn, setCheckIn] = useState(booking?.check_in ?? "");
  const [checkOut, setCheckOut] = useState(booking?.check_out ?? "");
  const [status, setStatus] = useState(booking?.status ?? "upcoming");
  const [adminNotes, setAdminNotes] = useState(booking?.admin_notes ?? "");
  const [arrivalTime, setArrivalTime] = useState(booking?.arrival_time ?? "");
  const [totalPrice, setTotalPrice] = useState(booking?.total_price?.toString() ?? "");
  const [numGuests, setNumGuests] = useState(booking?.num_guests?.toString() ?? "1");
  const [saving, setSaving] = useState(false);

  const guestNotes = booking?.notes ?? ""; // read-only guest special requests

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms-min"],
    queryFn: async () => {
      const { data } = await supabase.from("rooms").select("id, name, price").order("name");
      return (data ?? []) as { id: string; name: string; price: number }[];
    },
  });

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
    if (!guestName.trim()) { toast.error("Guest name is required"); return; }
    if (!roomIds.length) { toast.error("Select at least one room"); return; }
    if (!checkIn || !checkOut) { toast.error("Check-in and check-out are required"); return; }
    if (new Date(checkOut) <= new Date(checkIn)) { toast.error("Check-out must be after check-in"); return; }

    setSaving(true);
    try {
      // Availability check per room
      for (const rid of roomIds) {
        const rpcArgs: { _room_id: string; _check_in: string; _check_out: string; _exclude_booking?: string } = {
          _room_id: rid, _check_in: checkIn, _check_out: checkOut,
        };
        if (booking?.id) rpcArgs._exclude_booking = booking.id;
        const { data: avail, error: aerr } = await supabase.rpc("is_room_available", rpcArgs);
        if (aerr) throw new Error(`Availability check failed: ${aerr.message}`);
        if (avail === false) {
          const name = rooms.find((r) => r.id === rid)?.name ?? "room";
          toast.error(`${name} is not available for those dates.`);
          setSaving(false); return;
        }
      }

      // Upsert guest
      let gid = booking?.guest_id ?? null;
      const guestPayload = {
        name: guestName.trim(),
        phone: guestPhone.trim() || null,
        email: guestEmail.trim() || null,
        country: guestCountry.trim() || null,
      };
      if (gid) {
        const { error } = await supabase.from("guests").update(guestPayload).eq("id", gid);
        if (error) throw new Error(`Guest update failed: ${error.message}`);
      } else {
        const { data, error } = await supabase.from("guests").insert(guestPayload).select("id").single();
        if (error) throw new Error(`Guest create failed: ${error.message}`);
        gid = data.id;
      }

      const payload = {
        guest_id: gid, room_id: roomIds[0],
        check_in: checkIn, check_out: checkOut,
        status,
        admin_notes: adminNotes.trim() || null,
        arrival_time: arrivalTime.trim() || null,
        total_price: totalPrice ? Number(totalPrice) : null,
        num_guests: Number(numGuests) || 1,
      };

      let bookingId = booking?.id;
      if (isEdit) {
        const { error } = await supabase.from("bookings").update(payload).eq("id", booking!.id);
        if (error) throw new Error(`Booking update failed: ${error.message}`);
      } else {
        const { data, error } = await supabase.from("bookings").insert(payload).select("id").single();
        if (error) throw new Error(`Booking create failed: ${error.message}`);
        bookingId = data.id;
      }

      if (bookingId) {
        const { error: delErr } = await supabase.from("booking_rooms").delete().eq("booking_id", bookingId);
        if (delErr) throw new Error(`Booking rooms cleanup failed: ${delErr.message}`);
        const inserts = roomIds.map((rid) => ({
          booking_id: bookingId!,
          room_id: rid,
          price_per_night: rooms.find((r) => r.id === rid)?.price ?? null,
        }));
        if (inserts.length) {
          const { error } = await supabase.from("booking_rooms").insert(inserts);
          if (error) throw new Error(`Booking rooms insert failed: ${error.message}`);
        }
      }

      toast.success(isEdit ? "Booking updated" : "Booking created");
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      console.error("Booking save failed:", e);
      toast.error(msg);
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
      {isEdit && (
        <div className="text-xs text-muted-foreground font-mono border border-border rounded-md px-3 py-2 bg-muted/40">
          Booking ID: {booking!.id}
        </div>
      )}

      <div className="text-xs uppercase tracking-wide text-muted-foreground">Guest information</div>
      <div><Label>Full name *</Label><Input value={guestName} onChange={(e) => setGuestName(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Phone</Label><Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} /></div>
      </div>
      <div><Label>Country</Label><Input value={guestCountry} onChange={(e) => setGuestCountry(e.target.value)} /></div>

      <div className="text-xs uppercase tracking-wide text-muted-foreground pt-2">Stay details</div>
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
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="upcoming">Upcoming</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>
        <div><Label>Guests</Label><Input type="number" min="1" value={numGuests} onChange={(e) => setNumGuests(e.target.value)} /></div>
        <div><Label>Total price</Label><Input type="number" step="0.01" value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} /></div>
      </div>
      <div>
        <Label>Arrival time</Label>
        <Input placeholder="e.g. 15:30 or Late night" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} />
      </div>

      <div className="text-xs uppercase tracking-wide text-muted-foreground pt-2">Notes</div>
      <div>
        <Label>Guest notes / special requests (read-only)</Label>
        <div className="w-full min-h-[80px] px-3 py-2 rounded-md bg-muted/40 border border-border text-sm text-foreground whitespace-pre-wrap">
          {guestNotes || <span className="text-muted-foreground italic">No special requests submitted.</span>}
        </div>
      </div>
      <div>
        <Label>Admin notes (internal only)</Label>
        <Textarea rows={3} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Internal notes visible only to staff" />
      </div>

      <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : isEdit ? "Save changes" : "Create booking"}</Button>
        <Button variant="ghost" onClick={onCancel}>Close</Button>
        {isEdit && status !== "cancelled" && <Button variant="outline" onClick={cancelBooking}><X className="w-4 h-4" />Cancel booking</Button>}
        {isEdit && <Button variant="danger" onClick={deleteBooking}>Delete</Button>}
      </div>
    </div>
  );
}

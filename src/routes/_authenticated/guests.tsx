import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, Input, Drawer, Empty, Badge } from "@/components/admin/ui";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/guests")({
  component: GuestsPage,
});

type Guest = {
  id: string; name: string; phone: string | null; email: string | null;
  country: string | null; created_at: string;
};
type BookingLite = {
  id: string; check_in: string; check_out: string; status: string;
  total_price: number | null; num_guests: number | null; guest_id: string | null;
  room: { name: string } | null;
  booking_rooms: { room: { name: string } | null }[];
};

function GuestsPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Guest | null>(null);

  const { data: guests = [] } = useQuery({
    queryKey: ["guests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("guests")
        .select("id, name, phone, email, country, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Guest[];
    },
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["all-bookings-for-guests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select("id, check_in, check_out, status, total_price, num_guests, guest_id, room:rooms(name), booking_rooms(room:rooms(name))")
        .order("check_in", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BookingLite[];
    },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; first: string; last: string; currentStatus: string | null }>();
    const today = new Date().toISOString().slice(0, 10);
    for (const b of bookings) {
      if (!b.guest_id) continue;
      const cur = m.get(b.guest_id) ?? { count: 0, first: b.check_in, last: b.check_in, currentStatus: null };
      cur.count += 1;
      if (b.check_in < cur.first) cur.first = b.check_in;
      if (b.check_in > cur.last) cur.last = b.check_in;
      if (b.check_in <= today && b.check_out > today && b.status !== "cancelled") cur.currentStatus = b.status;
      m.set(b.guest_id, cur);
    }
    return m;
  }, [bookings]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return guests;
    return guests.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      g.email?.toLowerCase().includes(q) ||
      g.phone?.toLowerCase().includes(q) ||
      g.country?.toLowerCase().includes(q),
    );
  }, [guests, search]);

  const guestBookings = useMemo(
    () => selected ? bookings.filter((b) => b.guest_id === selected.id) : [],
    [selected, bookings],
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search guests by name, email, phone, country..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        {filtered.length === 0 ? <Empty title="No guests yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 font-medium text-right">Bookings</th>
                  <th className="px-4 py-3 font-medium">First stay</th>
                  <th className="px-4 py-3 font-medium">Last stay</th>
                  <th className="px-4 py-3 font-medium">Current</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const s = stats.get(g.id);
                  return (
                    <tr key={g.id} onClick={() => setSelected(g)} className="border-b border-border/50 last:border-0 hover:bg-accent/40 cursor-pointer">
                      <td className="px-4 py-3 font-medium">{g.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.phone ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.email ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.country ?? "—"}</td>
                      <td className="px-4 py-3 text-right">{s?.count ?? 0}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s ? format(new Date(s.first), "MMM d, yyyy") : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s ? format(new Date(s.last), "MMM d, yyyy") : "—"}</td>
                      <td className="px-4 py-3">{s?.currentStatus ? <Badge variant="success">{s.currentStatus}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Guest details">
        {selected && (
          <div className="space-y-5">
            <div className="space-y-1">
              <div className="text-lg font-semibold">{selected.name}</div>
              <div className="text-sm text-muted-foreground">{selected.email ?? "no email"}</div>
              <div className="text-sm text-muted-foreground">{selected.phone ?? "no phone"}</div>
              {selected.country && <div className="text-sm text-muted-foreground">{selected.country}</div>}
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Booking history ({guestBookings.length})</div>
              {guestBookings.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">No bookings yet.</div>
              ) : (
                <div className="border border-border rounded-md divide-y divide-border">
                  {guestBookings.map((b) => {
                    const rooms = b.booking_rooms?.map((br) => br.room?.name).filter(Boolean).join(", ") || b.room?.name || "—";
                    return (
                      <div key={b.id} className="p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-muted-foreground">#{b.id.slice(0, 8)}</span>
                          <Badge variant={b.status === "cancelled" ? "danger" : b.status === "completed" ? "muted" : "success"}>{b.status}</Badge>
                        </div>
                        <div>{rooms}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(b.check_in), "MMM d, yyyy")} → {format(new Date(b.check_out), "MMM d, yyyy")}
                          {" · "}{b.num_guests ?? 1} guest{(b.num_guests ?? 1) === 1 ? "" : "s"}
                          {b.total_price ? ` · $${b.total_price}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

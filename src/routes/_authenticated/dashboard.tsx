import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, Stat, Badge, Button, Empty } from "@/components/admin/ui";
import { format, subDays } from "date-fns";
import { Plus, Sparkles, BedDouble, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(); monthStart.setDate(1);
  const monthStartIso = monthStart.toISOString();
  const dayStartIso = new Date(today + "T00:00:00").toISOString();
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

  const stats = useQuery({
    queryKey: ["dashboard-stats", today],
    queryFn: async () => {
      const [total, upcoming, checkIns, checkOuts, occupiedRooms, totalRooms,
             vToday, vMonth, vAll, vSeries] = await Promise.all([
        supabase.from("bookings").select("*", { count: "exact", head: true }),
        supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "upcoming"),
        supabase.from("bookings").select("*", { count: "exact", head: true }).eq("check_in", today),
        supabase.from("bookings").select("*", { count: "exact", head: true }).eq("check_out", today),
        supabase.from("bookings").select("*", { count: "exact", head: true }).lte("check_in", today).gt("check_out", today).eq("status", "upcoming"),
        supabase.from("rooms").select("*", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", dayStartIso),
        supabase.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", monthStartIso),
        supabase.from("page_views").select("*", { count: "exact", head: true }),
        supabase.from("page_views").select("created_at").gte("created_at", thirtyDaysAgo).limit(10000),
      ]);
      const byDay: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        byDay[subDays(new Date(), i).toISOString().slice(0, 10)] = 0;
      }
      (vSeries.data ?? []).forEach((r) => {
        const d = (r.created_at as string).slice(0, 10);
        if (d in byDay) byDay[d]++;
      });
      return {
        total: total.count ?? 0,
        upcoming: upcoming.count ?? 0,
        checkInsToday: checkIns.count ?? 0,
        checkOutsToday: checkOuts.count ?? 0,
        occupied: occupiedRooms.count ?? 0,
        rooms: totalRooms.count ?? 0,
        visitorsToday: vToday.count ?? 0,
        visitorsMonth: vMonth.count ?? 0,
        visitorsAll: vAll.count ?? 0,
        series: Object.entries(byDay).map(([date, count]) => ({ date, count })),
      };
    },
  });

  const recent = useQuery({
    queryKey: ["recent-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, check_in, check_out, status, created_at, guest:guests(name), room:rooms(name)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const s = stats.data;
  const occupancy = s && s.rooms > 0 ? Math.round((s.occupied / s.rooms) * 100) : 0;
  const maxSeries = s ? Math.max(1, ...s.series.map((p) => p.count)) : 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Bookings" value={s?.total ?? "—"} />
        <Stat label="Upcoming" value={s?.upcoming ?? "—"} />
        <Stat label="Check-ins Today" value={s?.checkInsToday ?? "—"} />
        <Stat label="Check-outs Today" value={s?.checkOutsToday ?? "—"} />
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Website Visitors</h3>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <Stat label="Today" value={s?.visitorsToday ?? "—"} />
          <Stat label="This month" value={s?.visitorsMonth ?? "—"} />
          <Stat label="All time" value={s?.visitorsAll ?? "—"} />
        </div>
        {s && (
          <div className="flex items-end gap-1 h-32">
            {s.series.map((p) => (
              <div key={p.date} className="flex-1 flex flex-col items-center gap-1" title={`${p.date}: ${p.count}`}>
                <div className="w-full bg-primary/70 hover:bg-primary rounded-t transition-colors" style={{ height: `${(p.count / maxSeries) * 100}%`, minHeight: p.count > 0 ? "2px" : "0" }} />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
          <span>30 days ago</span><span>Today</span>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">Occupancy</div>
            <div className="text-xs text-muted-foreground">{s?.occupied ?? 0} of {s?.rooms ?? 0} rooms occupied</div>
          </div>
          <div className="text-2xl font-bold text-primary">{occupancy}%</div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${occupancy}%` }} />
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Bookings</h3>
            <Link to="/bookings" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {recent.data && recent.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b border-border">
                  <tr>
                    <th className="py-2 font-medium">Guest</th>
                    <th className="py-2 font-medium">Room</th>
                    <th className="py-2 font-medium">Check-in</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.map((b) => (
                    <tr key={b.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3">{b.guest?.name ?? "—"}</td>
                      <td className="py-3 text-muted-foreground">{b.room?.name ?? "—"}</td>
                      <td className="py-3 text-muted-foreground">{format(new Date(b.check_in), "MMM d")}</td>
                      <td className="py-3"><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No bookings yet" />}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <Link to="/rooms"><Button variant="outline" className="w-full justify-start"><BedDouble className="w-4 h-4" />Add a room</Button></Link>
            <Link to="/experiences"><Button variant="outline" className="w-full justify-start"><Sparkles className="w-4 h-4" />Add an experience</Button></Link>
            <Link to="/bookings"><Button variant="outline" className="w-full justify-start"><Plus className="w-4 h-4" />New booking</Button></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "success" | "warning" | "danger" | "muted"> = {
    upcoming: "warning", confirmed: "success", completed: "muted", cancelled: "danger",
  };
  return <Badge variant={map[status] ?? "default"}>{status}</Badge>;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, Stat, Button, Empty } from "@/components/admin/ui";
import { StatusPill } from "@/lib/booking-status";
import { format, subDays } from "date-fns";
import { Plus, Sparkles, BedDouble, Eye, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

// Admin dashboard paths — excluded so "Website Visitors" reflects only the
// public website (separate project writing into the same page_views table).
const ADMIN_PATH_PREFIXES = [
  "/dashboard",
  "/bookings",
  "/auth",
  "/calendar",
  "/content",
  "/reviews",
  "/settings",
  "/guests",
  "/faq",
  "/media",
  "/rooms/",
  "/experiences/",
  "/reset-password",
];
const ADMIN_EXACT = new Set(["/rooms", "/experiences"]);

function isPublicPath(p: string | null | undefined): boolean {
  if (!p) return false;
  if (ADMIN_EXACT.has(p)) return false;
  return !ADMIN_PATH_PREFIXES.some((pref) => p.startsWith(pref));
}

function Dashboard() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const dayStart = new Date(today + "T00:00:00");
  const weekStart = subDays(new Date(), 7);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const seriesStart = subDays(new Date(), 30);

  const bookingStats = useQuery({
    queryKey: ["dashboard-booking-stats", today],
    queryFn: async () => {
      const [total, upcoming, checkIns, checkOuts, occupiedRooms, totalRooms] = await Promise.all([
        supabase.from("bookings").select("*", { count: "exact", head: true }),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .gt("check_in", today)
          .neq("status", "cancelled"),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("check_in", today)
          .neq("status", "cancelled"),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("check_out", today)
          .neq("status", "cancelled"),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .lte("check_in", today)
          .gt("check_out", today)
          .neq("status", "cancelled"),
        supabase.from("rooms").select("*", { count: "exact", head: true }).eq("is_active", true),
      ]);
      return {
        total: total.count ?? 0,
        upcoming: upcoming.count ?? 0,
        checkInsToday: checkIns.count ?? 0,
        checkOutsToday: checkOuts.count ?? 0,
        occupied: occupiedRooms.count ?? 0,
        rooms: totalRooms.count ?? 0,
      };
    },
  });

  const visitors = useQuery({
    queryKey: ["dashboard-visitors"],
    queryFn: async () => {
      // Pull last 90 days once, aggregate client-side so we can filter admin paths.
      const from = subDays(new Date(), 90).toISOString();
      const { data, error } = await supabase
        .from("page_views")
        .select("path, created_at")
        .gte("created_at", from)
        .limit(10000);
      if (error) throw error;
      const rows = (data ?? []).filter((r) => isPublicPath(r.path as string));
      // All-time public visitors via server-side count, excluding admin paths.
      let allTime = 0;
      try {
        let q = supabase.from("page_views").select("*", { count: "exact", head: true });
        for (const p of ADMIN_PATH_PREFIXES) q = q.not("path", "like", `${p}%`);
        for (const p of ADMIN_EXACT) q = q.neq("path", p);
        const r = await q;
        allTime = r.count ?? 0;
      } catch {
        allTime = rows.length;
      }

      const dayStartMs = dayStart.getTime();
      const weekStartMs = weekStart.getTime();
      const monthStartMs = monthStart.getTime();

      let todayCount = 0,
        weekCount = 0,
        monthCount = 0;
      const byDay: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        byDay[subDays(new Date(), i).toISOString().slice(0, 10)] = 0;
      }
      const seriesStartMs = seriesStart.getTime();
      for (const r of rows) {
        const ts = new Date(r.created_at as string).getTime();
        if (ts >= dayStartMs) todayCount++;
        if (ts >= weekStartMs) weekCount++;
        if (ts >= monthStartMs) monthCount++;
        if (ts >= seriesStartMs) {
          const d = (r.created_at as string).slice(0, 10);
          if (d in byDay) byDay[d]++;
        }
      }
      return {
        today: todayCount,
        week: weekCount,
        month: monthCount,
        allTime,
        series: Object.entries(byDay).map(([date, count]) => ({ date, count })),
      };
    },
  });

  // Realtime: refresh visitor stats when new public page_views arrive.
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-page-views")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "page_views" }, () => {
        qc.invalidateQueries({ queryKey: ["dashboard-visitors"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

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

  const s = bookingStats.data;
  const v = visitors.data;
  const occupancy = s && s.rooms > 0 ? Math.round((s.occupied / s.rooms) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total Bookings" value={s?.total ?? "—"} />
        <Stat label="Upcoming" value={s?.upcoming ?? "—"} />
        <Stat label="Check-ins Today" value={s?.checkInsToday ?? "—"} />
        <Stat label="Check-outs Today" value={s?.checkOutsToday ?? "—"} />
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <Eye className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Website Visitors</h2>
              <p className="text-xs text-muted-foreground">Live traffic from your public website</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <VisitorTile label="Today" value={v?.today} />
          <VisitorTile label="This week" value={v?.week} />
          <VisitorTile label="This month" value={v?.month} />
          <VisitorTile label="All time" value={v?.allTime} accent />
        </div>

        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Visitor trend — last 30 days</span>
        </div>
        {v && (
          <div className="h-48 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={v.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="visitorFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="currentColor"
                  className="text-muted-foreground/15"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => format(new Date(d), "MMM d")}
                  interval={Math.max(0, Math.floor(v.series.length / 6) - 1)}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  className="text-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  width={28}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  className="text-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [value, "Visits"]}
                  labelFormatter={(d: string) => format(new Date(d), "MMM d, yyyy")}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--foreground)" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#visitorFill)"
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">Occupancy</div>
            <div className="text-xs text-muted-foreground">
              {s?.occupied ?? 0} of {s?.rooms ?? 0} rooms occupied
            </div>
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
            <h2 className="font-semibold">Recent Bookings</h2>
            <Link to="/bookings" className="text-xs text-primary hover:underline">
              View all
            </Link>
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
                      <td className="py-3 text-muted-foreground">
                        {format(new Date(b.check_in), "MMM d")}
                      </td>
                      <td className="py-3">
                        <StatusPill
                          checkIn={b.check_in}
                          checkOut={b.check_out}
                          rawStatus={b.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="No bookings yet" />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link to="/rooms">
              <Button variant="outline" className="w-full justify-start">
                <BedDouble className="w-4 h-4" />
                Add a room
              </Button>
            </Link>
            <Link to="/experiences">
              <Button variant="outline" className="w-full justify-start">
                <Sparkles className="w-4 h-4" />
                Add an experience
              </Button>
            </Link>
            <Link to="/bookings">
              <Button variant="outline" className="w-full justify-start">
                <Plus className="w-4 h-4" />
                New booking
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function VisitorTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | undefined;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-border p-4 ${accent ? "bg-primary/5" : "bg-background/40"}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent ? "text-primary" : "text-foreground"}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}

import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  CalendarDays,
  BedDouble,
  CalendarRange,
  Sparkles,
  Star,
  HelpCircle,
  FileText,
  Image as ImageIcon,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: AuthedShell,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/bookings", label: "Bookings", icon: CalendarDays },
  { to: "/rooms", label: "Rooms", icon: BedDouble },
  { to: "/calendar", label: "Availability", icon: CalendarRange },
  { to: "/experiences", label: "Experiences", icon: Sparkles },
  { to: "/reviews", label: "Reviews", icon: Star },
  { to: "/faq", label: "FAQ", icon: HelpCircle },
  { to: "/content", label: "Website Content", icon: FileText },
  { to: "/media", label: "Media Library", icon: ImageIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function AuthedShell() {
  const { user, isStaff, loading, roles } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md text-center bg-card border border-border rounded-xl p-8">
          <h1 className="text-xl font-semibold mb-2">Access pending</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Your account ({user?.email}) is awaiting approval. An existing administrator must
            approve your signup to grant access.
          </p>
          <div className="text-xs text-muted-foreground bg-muted rounded-md p-3 text-left">
            <p className="mb-1 font-mono">Your user id:</p>
            <p className="font-mono break-all text-foreground">{user?.id}</p>
            <p className="mt-2">Roles: {roles.length ? roles.join(", ") : "(none)"}</p>
          </div>
          <button onClick={signOut} className="mt-6 text-sm text-primary hover:underline">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-16 px-6 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center">
            L
          </div>
          <div>
            <div className="font-semibold text-sidebar-foreground">Lavista</div>
            <div className="text-xs text-muted-foreground">Admin Panel</div>
          </div>
        </div>
        <nav className="px-3 py-4 space-y-1 overflow-y-auto h-[calc(100vh-4rem-5rem)]">
          {NAV.map((n) => {
            const active =
              pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border bg-sidebar">
          <div className="text-xs text-muted-foreground truncate mb-2">{user?.email}</div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent text-sidebar-foreground"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="h-16 px-4 lg:px-8 flex items-center gap-3 border-b border-border bg-card/30 backdrop-blur sticky top-0 z-20">
          <button
            className="lg:hidden p-2 rounded-md hover:bg-accent"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h1 className="text-lg font-semibold capitalize">
            {NAV.find((n) => pathname.startsWith(n.to))?.label ?? "Dashboard"}
          </h1>
        </header>
        <main className="flex-1 p-4 lg:p-8 max-w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

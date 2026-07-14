import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Badge } from "@/components/admin/ui";
import { useAuth } from "@/hooks/use-auth";
import { Check, X as XIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-4">
      <PendingApprovals />
      <RolesAdmin />
    </div>
  );
}

type Approval = {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  requested_role: string;
  status: string;
  created_at: string;
};

function PendingApprovals() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: approvals = [] } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_approvals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Approval[];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  const pending = approvals.filter((a) => a.status === "pending");

  async function approve(a: Approval) {
    const { error: roleErr } = await supabase
      .from("user_roles")
      .insert({ user_id: a.user_id, role: "admin" });
    if (roleErr && !roleErr.message.includes("duplicate")) {
      toast.error(roleErr.message);
      return;
    }
    const { error } = await supabase
      .from("pending_approvals")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${a.email} approved as admin`);
    qc.invalidateQueries({ queryKey: ["pending-approvals"] });
  }

  async function reject(a: Approval) {
    if (!confirm(`Reject ${a.email}?`)) return;
    const { error } = await supabase
      .from("pending_approvals")
      .update({
        status: "rejected",
        decided_at: new Date().toISOString(),
      })
      .eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rejected");
    qc.invalidateQueries({ queryKey: ["pending-approvals"] });
  }

  return (
    <Card className="p-5 border-primary/40">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Pending Approvals</h3>
        {pending.length > 0 && <Badge variant="warning">{pending.length} waiting</Badge>}
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        All approved users get full administrator access.
      </p>
      {pending.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No pending signups. New signups appear here for approval.
        </p>
      ) : (
        <div className="space-y-2">
          {pending.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 rounded-md p-3"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm">{a.full_name ?? "(no name)"}</div>
                <div className="text-xs text-muted-foreground truncate">{a.email}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approve(a)}>
                  <Check className="w-3 h-3" /> Approve as admin
                </Button>
                <Button size="sm" variant="ghost" onClick={() => reject(a)}>
                  <XIcon className="w-3 h-3" /> Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function RolesAdmin() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  async function revoke(id: string) {
    if (!confirm("Revoke this role?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["all-roles"] });
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-4">Granted Admins</h3>
      <div className="space-y-2">
        {roles.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2 text-sm"
          >
            <div className="font-mono text-xs truncate">{r.user_id}</div>
            <div className="flex items-center gap-3">
              <span className="text-primary text-xs font-medium">{r.role}</span>
              <Button size="sm" variant="ghost" onClick={() => revoke(r.id)}>
                Revoke
              </Button>
            </div>
          </div>
        ))}
        {roles.length === 0 && (
          <p className="text-xs text-muted-foreground">No admins granted yet.</p>
        )}
      </div>
    </Card>
  );
}

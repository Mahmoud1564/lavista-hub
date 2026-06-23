import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Label } from "@/components/admin/ui";
import { useAuth } from "@/hooks/use-auth";

type Row = { id: string; key: string; value: Record<string, unknown> };

const SECTIONS: { key: string; title: string; fields: { name: string; label: string }[] }[] = [
  { key: "hotel", title: "Hotel Info", fields: [
    { name: "name", label: "Hotel name" },
    { name: "tagline", label: "Tagline" },
  ]},
  { key: "contact", title: "Contact", fields: [
    { name: "phone", label: "Phone" },
    { name: "email", label: "Email" },
    { name: "address", label: "Address" },
  ]},
  { key: "social", title: "Social Links", fields: [
    { name: "instagram", label: "Instagram URL" },
    { name: "facebook", label: "Facebook URL" },
    { name: "twitter", label: "Twitter URL" },
    { name: "tiktok", label: "TikTok URL" },
  ]},
  { key: "booking", title: "Booking Settings", fields: [
    { name: "min_stay_nights", label: "Min stay (nights)" },
    { name: "max_stay_nights", label: "Max stay (nights)" },
    { name: "cancellation_window_hours", label: "Free cancellation window (hours)" },
  ]},
  { key: "currency", title: "Currency", fields: [
    { name: "code", label: "Currency code (e.g. USD)" },
    { name: "symbol", label: "Symbol (e.g. $)" },
  ]},
];

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <div className="space-y-4">
      {SECTIONS.map((s) => (
        <SettingsSection key={s.key} section={s} row={rows.find((r) => r.key === s.key) ?? null}
          onSaved={() => qc.invalidateQueries({ queryKey: ["settings"] })} />
      ))}
      <RolesAdmin />
    </div>
  );
}

function SettingsSection({ section, row, onSaved }: { section: typeof SECTIONS[number]; row: Row | null; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initial: Record<string, string> = {};
    section.fields.forEach((f) => { initial[f.name] = ((row?.value?.[f.name] as string) ?? ""); });
    setValues(initial);
  }, [row, section]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("settings").upsert({ key: section.key, value: values }, { onConflict: "key" });
      if (error) throw error;
      toast.success(`${section.title} saved`); onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-4">{section.title}</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        {section.fields.map((f) => (
          <div key={f.name}>
            <Label>{f.label}</Label>
            <Input value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="mt-4"><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></div>
    </Card>
  );
}

function RolesAdmin() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");

  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isAdmin,
  });

  if (!isAdmin) return null;

  async function grant() {
    if (!userId) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message); else {
      toast.success("Role granted");
      setUserId("");
      qc.invalidateQueries({ queryKey: ["all-roles"] });
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this role?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["all-roles"] });
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-4">Staff Access (Admin only)</h3>
      <p className="text-xs text-muted-foreground mb-3">Grant the <code className="text-primary">admin</code> or <code className="text-primary">staff</code> role to a user. Get the user's ID from the access-pending screen they see after signing up, or from Supabase Auth dashboard.</p>
      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mb-4">
        <Input placeholder="User UUID" value={userId} onChange={(e) => setUserId(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "staff")} className="px-3 py-2 rounded-md bg-input border border-border">
          <option value="staff">staff</option>
          <option value="admin">admin</option>
        </select>
        <Button onClick={grant}>Grant role</Button>
      </div>
      <div className="space-y-2">
        {roles.map((r) => (
          <div key={r.id} className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2 text-sm">
            <div className="font-mono text-xs">{r.user_id}</div>
            <div className="flex items-center gap-3">
              <span className="text-primary text-xs font-medium">{r.role}</span>
              <Button size="sm" variant="ghost" onClick={() => revoke(r.id)}>Revoke</Button>
            </div>
          </div>
        ))}
        {roles.length === 0 && <p className="text-xs text-muted-foreground">No roles granted yet.</p>}
      </div>
    </Card>
  );
}

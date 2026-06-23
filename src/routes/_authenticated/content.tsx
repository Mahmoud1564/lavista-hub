import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Textarea, Label } from "@/components/admin/ui";

type ContentRow = { id: string; key: string; value: Record<string, unknown> };

const SECTIONS: { key: string; title: string; fields: { name: string; label: string; type?: "text" | "textarea" }[] }[] = [
  { key: "hero", title: "Hero Section", fields: [
    { name: "title", label: "Title" },
    { name: "subtitle", label: "Subtitle", type: "textarea" },
    { name: "cta_text", label: "Button text" },
  ]},
  { key: "about", title: "About Section", fields: [
    { name: "title", label: "Title" },
    { name: "body", label: "Body", type: "textarea" },
  ]},
  { key: "features", title: "Features", fields: [
    { name: "title", label: "Title" },
    { name: "items", label: "Items (one per line)", type: "textarea" },
  ]},
  { key: "contact", title: "Contact Info", fields: [
    { name: "phone", label: "Phone" },
    { name: "email", label: "Email" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "whatsapp", label: "WhatsApp number (e.g. +1234567890)" },
  ]},
  { key: "footer", title: "Footer", fields: [
    { name: "tagline", label: "Tagline" },
    { name: "copyright", label: "Copyright text" },
  ]},
  { key: "seo", title: "SEO Metadata", fields: [
    { name: "title", label: "Page title" },
    { name: "description", label: "Meta description", type: "textarea" },
    { name: "keywords", label: "Keywords" },
  ]},
];

export const Route = createFileRoute("/_authenticated/content")({
  component: ContentPage,
});

function ContentPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["website_content"],
    queryFn: async () => {
      const { data, error } = await supabase.from("website_content").select("*");
      if (error) throw error;
      return (data ?? []) as ContentRow[];
    },
  });

  return (
    <div className="space-y-4">
      {SECTIONS.map((s) => (
        <SectionCard key={s.key} section={s} row={rows.find((r) => r.key === s.key) ?? null}
          onSaved={() => qc.invalidateQueries({ queryKey: ["website_content"] })} />
      ))}
    </div>
  );
}

function SectionCard({ section, row, onSaved }: { section: typeof SECTIONS[number]; row: ContentRow | null; onSaved: () => void }) {
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
      const { error } = await supabase.from("website_content").upsert({ key: section.key, value: values }, { onConflict: "key" });
      if (error) throw error;
      toast.success(`${section.title} saved`);
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-4">{section.title}</h3>
      <div className="space-y-3">
        {section.fields.map((f) => (
          <div key={f.name}>
            <Label>{f.label}</Label>
            {f.type === "textarea"
              ? <Textarea rows={3} value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              : <Input value={values[f.name] ?? ""} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />}
          </div>
        ))}
      </div>
      <div className="mt-4"><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></div>
    </Card>
  );
}

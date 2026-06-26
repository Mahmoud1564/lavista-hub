import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Textarea, Label } from "@/components/admin/ui";
import { Upload, Trash2 } from "lucide-react";
import { uploadFile, deleteFile, getSignedUrl } from "@/lib/storage";

const ABOUT_BUCKET = "review-images"; // reuse private bucket

type ContentRow = { id: string; key: string; value: Record<string, unknown> };

const SECTIONS: { key: string; title: string; fields: { name: string; label: string; type?: "text" | "textarea" }[] }[] = [
  { key: "hero", title: "Hero Section", fields: [
    { name: "title", label: "Title" },
    { name: "subtitle", label: "Subtitle", type: "textarea" },
  ]},
  { key: "about", title: "About Section", fields: [
    { name: "title", label: "Title" },
    { name: "body", label: "Body", type: "textarea" },
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
      <Card className="p-4 bg-muted/30 text-xs text-muted-foreground">
        Contact info, footer, and social links are managed in <span className="text-primary font-medium">Settings</span> — single source of truth.
      </Card>
      {SECTIONS.map((s) => (
        <SectionCard
          key={s.key}
          section={s}
          row={rows.find((r) => r.key === s.key) ?? null}
          onSaved={() => qc.invalidateQueries({ queryKey: ["website_content"] })}
          renderExtras={s.key === "about" ? (row, onChange) => <AboutImage row={row} onChange={onChange} /> : undefined}
        />
      ))}
    </div>
  );
}

function SectionCard({
  section, row, onSaved, renderExtras,
}: {
  section: typeof SECTIONS[number];
  row: ContentRow | null;
  onSaved: () => void;
  renderExtras?: (row: ContentRow | null, onChange: () => void) => React.ReactNode;
}) {
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
      // Preserve existing keys (like image_url) when saving text fields
      const merged = { ...(row?.value ?? {}), ...values } as unknown as Record<string, string>;
      const { error } = await supabase.from("website_content").upsert({ key: section.key, value: merged }, { onConflict: "key" });
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
      {renderExtras && <div className="mt-4 pt-4 border-t border-border">{renderExtras(row, onSaved)}</div>}
      <div className="mt-4"><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></div>
    </Card>
  );
}

function AboutImage({ row, onChange }: { row: ContentRow | null; onChange: () => void }) {
  const path = (row?.value?.image_url as string) ?? "";
  const [signed, setSigned] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!path) { setSigned(null); return; }
    getSignedUrl(ABOUT_BUCKET, path).then(setSigned);
  }, [path]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      if (path) await deleteFile(ABOUT_BUCKET, path);
      const newPath = await uploadFile(ABOUT_BUCKET, file);
      const merged = { ...(row?.value ?? {}), image_url: newPath } as unknown as Record<string, string>;
      const { error } = await supabase.from("website_content").upsert({ key: "about", value: merged }, { onConflict: "key" });
      if (error) throw error;
      toast.success("About image updated");
      onChange();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally { setBusy(false); e.target.value = ""; }
  }

  async function onDelete() {
    if (!path || !confirm("Delete the About image?")) return;
    setBusy(true);
    try {
      await deleteFile(ABOUT_BUCKET, path);
      const merged = { ...(row?.value ?? {}), image_url: "" } as unknown as Record<string, string>;
      await supabase.from("website_content").upsert({ key: "about", value: merged }, { onConflict: "key" });
      toast.success("About image removed");
      onChange();
    } finally { setBusy(false); }
  }

  return (
    <div>
      <Label>About Image (single image shown on the website)</Label>
      <div className="flex items-start gap-4 mt-2">
        <div className="w-40 h-28 bg-muted rounded-md overflow-hidden flex items-center justify-center flex-shrink-0">
          {signed ? <img src={signed} alt="About" className="w-full h-full object-cover" /> : <span className="text-xs text-muted-foreground">No image</span>}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm cursor-pointer hover:opacity-90 w-fit">
            <Upload className="w-4 h-4" /> {path ? "Replace image" : "Upload image"}
            <input type="file" accept="image/*" className="hidden" onChange={onUpload} disabled={busy} />
          </label>
          {path && (
            <Button type="button" size="sm" variant="ghost" onClick={onDelete} disabled={busy}>
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Textarea, Label } from "@/components/admin/ui";
import { Upload, X, ArrowUp, ArrowDown } from "lucide-react";
import { uploadFile, deleteFile, getSignedUrls } from "@/lib/storage";

const BUCKET = "review-images"; // reuse existing bucket for about images (private)

type ContentRow = { id: string; key: string; value: Record<string, unknown> };

// Simplified — moved contact, footer, features out (contact/footer live in Settings)
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
        <SectionCard key={s.key} section={s} row={rows.find((r) => r.key === s.key) ?? null}
          onSaved={() => qc.invalidateQueries({ queryKey: ["website_content"] })} />
      ))}
      <AboutGallery />
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

type AboutImg = { id: string; image_url: string; caption: string | null; sort_order: number; signed?: string | null };

function AboutGallery() {
  const qc = useQueryClient();
  const { data: images = [] } = useQuery({
    queryKey: ["about_images"],
    queryFn: async () => {
      const { data, error } = await supabase.from("about_images").select("*").order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as AboutImg[];
      const paths = rows.map((r) => r.image_url);
      const signed = await getSignedUrls(BUCKET, paths);
      return rows.map((r) => ({ ...r, signed: signed[r.image_url] ?? null }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["about_images"] });

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    try {
      let nextOrder = (images[images.length - 1]?.sort_order ?? -1) + 1;
      for (const f of files) {
        const path = await uploadFile(BUCKET, f);
        const { error } = await supabase.from("about_images").insert({ image_url: path, sort_order: nextOrder++ });
        if (error) throw error;
      }
      toast.success("Uploaded");
      refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
    e.target.value = "";
  }

  async function remove(img: AboutImg) {
    if (!confirm("Delete this image?")) return;
    await supabase.from("about_images").delete().eq("id", img.id);
    await deleteFile(BUCKET, img.image_url);
    refresh();
  }

  async function updateCaption(id: string, caption: string) {
    await supabase.from("about_images").update({ caption }).eq("id", id);
  }

  async function move(img: AboutImg, dir: -1 | 1) {
    const idx = images.findIndex((i) => i.id === img.id);
    const swap = images[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from("about_images").update({ sort_order: swap.sort_order }).eq("id", img.id),
      supabase.from("about_images").update({ sort_order: img.sort_order }).eq("id", swap.id),
    ]);
    refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">About Gallery</h3>
        <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm cursor-pointer hover:opacity-90">
          <Upload className="w-4 h-4" /> Add images
          <input type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
        </label>
      </div>
      {images.length === 0 ? (
        <p className="text-xs text-muted-foreground">No images yet. Upload property photos to display in the About section.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {images.map((img, idx) => (
            <div key={img.id} className="bg-muted rounded-md overflow-hidden">
              <div className="relative aspect-video bg-background">
                {img.signed && <img src={img.signed} alt={img.caption ?? ""} className="w-full h-full object-cover" />}
                <button onClick={() => remove(img)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"><X className="w-3 h-3" /></button>
                <div className="absolute bottom-1 left-1 flex gap-1">
                  <button onClick={() => move(img, -1)} disabled={idx === 0} className="bg-background/80 rounded p-1 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                  <button onClick={() => move(img, 1)} disabled={idx === images.length - 1} className="bg-background/80 rounded p-1 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                </div>
              </div>
              <input defaultValue={img.caption ?? ""} onBlur={(e) => updateCaption(img.id, e.target.value)} placeholder="Caption (optional)" className="w-full px-2 py-1.5 text-xs bg-transparent border-t border-border focus:outline-none" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

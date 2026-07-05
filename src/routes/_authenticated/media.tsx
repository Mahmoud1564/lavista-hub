import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Empty, Select } from "@/components/admin/ui";
import { Upload, Trash2, Copy } from "lucide-react";
import { uploadFile, deleteFile, getSignedUrls } from "@/lib/storage";

const BUCKETS = ["room-images", "experience-images", "review-images"] as const;
type Bucket = (typeof BUCKETS)[number];

export const Route = createFileRoute("/_authenticated/media")({
  component: MediaPage,
});

function MediaPage() {
  const [bucket, setBucket] = useState<Bucket>("room-images");
  const qc = useQueryClient();

  const { data: files = [] } = useQuery({
    queryKey: ["media", bucket],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
      if (error) throw error;
      const items = (data ?? []).filter((f) => f.name && !f.name.endsWith("/"));
      const paths = items.map((f) => f.name);
      const signed = await getSignedUrls(bucket, paths);
      return items.map((f) => ({ name: f.name, url: signed[f.name] ?? null, size: f.metadata?.size ?? 0 }));
    },
  });

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    for (const f of Array.from(e.target.files ?? [])) {
      try { await uploadFile(bucket, f); } catch (err: unknown) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    }
    toast.success("Uploaded");
    qc.invalidateQueries({ queryKey: ["media", bucket] });
    e.target.value = "";
  }

  async function del(name: string) {
    if (!confirm("Delete this image? Any room/experience/review still using it will lose its photo.")) return;
    await deleteFile(bucket, name);
    qc.invalidateQueries({ queryKey: ["media", bucket] });
  }

  function copyPath(name: string) {
    navigator.clipboard.writeText(name);
    toast.success("Path copied");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <Select value={bucket} onChange={(e) => setBucket(e.target.value as Bucket)} className="sm:w-64">
          {BUCKETS.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm cursor-pointer hover:opacity-90">
          <Upload className="w-4 h-4" /> Upload images
          <input type="file" accept="image/*" multiple onChange={onUpload} className="hidden" />
        </label>
      </div>

      {files.length === 0 ? <Card className="p-8"><Empty title="No images in this bucket yet" /></Card> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {files.map((f) => (
            <Card key={f.name} className="overflow-hidden group">
              <div className="aspect-square bg-muted">
                {f.url && <img src={f.url} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="p-2 flex items-center justify-between gap-1">
                <span className="text-xs text-muted-foreground truncate flex-1" title={f.name}>{f.name}</span>
                <Button size="sm" variant="ghost" aria-label="Copy path" onClick={() => copyPath(f.name)}><Copy className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label="Delete image" onClick={() => del(f.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

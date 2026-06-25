import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Textarea, Label, Drawer, Empty, Badge } from "@/components/admin/ui";
import { Plus, Trash2, Upload, X, Star } from "lucide-react";
import { uploadFile, deleteFile, getSignedUrls } from "@/lib/storage";

const BUCKET = "experience-images";

type Experience = {
  id: string; title: string; description: string | null; is_active: boolean;
  duration: string | null; meeting_point: string | null; pickup_info: string | null;
  thumbnail_url: string | null;
};

export const Route = createFileRoute("/_authenticated/experiences")({
  component: ExpPage,
});

function ExpPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Experience | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["experiences"],
    queryFn: async () => {
      const { data, error } = await supabase.from("experiences").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Experience[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["experiences"] });

  async function toggle(e: Experience) {
    const { error } = await supabase.from("experiences").update({ is_active: !e.is_active }).eq("id", e.id);
    if (error) toast.error(error.message); else { toast.success("Updated"); refresh(); }
  }

  async function del(e: Experience) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    const { data: imgs } = await supabase.from("experience_images").select("image_url").eq("experience_id", e.id);
    await Promise.all((imgs ?? []).map((i) => deleteFile(BUCKET, i.image_url)));
    const { error } = await supabase.from("experiences").delete().eq("id", e.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); refresh(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" />Add experience</Button>
      </div>
      {items.length === 0 ? <Card className="p-8"><Empty title="No experiences yet" /></Card> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((e) => (
            <Card key={e.id} className="p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold">{e.title}</h3>
                <Badge variant={e.is_active ? "success" : "muted"}>{e.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 mb-2 min-h-[3rem]">{e.description ?? "No description"}</p>
              {e.duration && <p className="text-xs text-primary mb-3">⏱ {e.duration}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(e)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => toggle(e)}>{e.is_active ? "Hide" : "Show"}</Button>
                <Button size="sm" variant="ghost" onClick={() => del(e)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Edit experience">
        {editing && <Form item={editing} onSaved={async () => { await refresh(); setEditing(null); }} />}
      </Drawer>
      <Drawer open={creating} onClose={() => setCreating(false)} title="New experience">
        <Form onSaved={async () => { await refresh(); setCreating(false); }} />
      </Drawer>
    </div>
  );
}

type ExpImg = { id: string; image_url: string; signed: string | null; is_thumbnail: boolean };
type ExpDate = { id: string; date: string; is_available: boolean };

function Form({ item, onSaved }: { item?: Experience; onSaved: () => void }) {
  const isEdit = !!item;
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [duration, setDuration] = useState(item?.duration ?? "");
  const [meetingPoint, setMeetingPoint] = useState(item?.meeting_point ?? "");
  const [pickupInfo, setPickupInfo] = useState(item?.pickup_info ?? "");
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState<ExpImg[]>([]);
  const [dates, setDates] = useState<ExpDate[]>([]);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    if (!item) return;
    (async () => {
      const [{ data: imgs }, { data: ds }] = await Promise.all([
        supabase.from("experience_images").select("*").eq("experience_id", item.id).order("sort_order"),
        supabase.from("experience_dates").select("*").eq("experience_id", item.id).order("date"),
      ]);
      const paths = (imgs ?? []).map((i) => i.image_url);
      const signed = await getSignedUrls(BUCKET, paths);
      setImages((imgs ?? []).map((i) => ({
        id: i.id, image_url: i.image_url, signed: signed[i.image_url] ?? null,
        is_thumbnail: i.is_thumbnail ?? false,
      })));
      setDates((ds ?? []) as ExpDate[]);
    })();
  }, [item]);

  async function save() {
    if (!title) return toast.error("Title required");
    setSaving(true);
    try {
      const payload = {
        title, description: description || null, is_active: isActive,
        duration: duration || null, meeting_point: meetingPoint || null, pickup_info: pickupInfo || null,
      };
      if (isEdit) {
        const { error } = await supabase.from("experiences").update(payload).eq("id", item!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("experiences").insert(payload);
        if (error) throw error;
      }
      toast.success("Saved"); onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!item) return toast.error("Save first");
    let nextOrder = images.length;
    for (const f of Array.from(e.target.files ?? [])) {
      try {
        const path = await uploadFile(BUCKET, f);
        const { data, error } = await supabase.from("experience_images")
          .insert({ experience_id: item.id, image_url: path, sort_order: nextOrder++ }).select("*").single();
        if (error) throw error;
        const signed = await getSignedUrls(BUCKET, [path]);
        setImages((p) => [...p, { id: data.id, image_url: path, signed: signed[path] ?? null, is_thumbnail: false }]);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    }
    e.target.value = "";
  }

  async function removeImage(img: ExpImg) {
    await supabase.from("experience_images").delete().eq("id", img.id);
    await deleteFile(BUCKET, img.image_url);
    setImages((p) => p.filter((i) => i.id !== img.id));
  }

  async function setThumb(img: ExpImg) {
    if (!item) return;
    await supabase.from("experience_images").update({ is_thumbnail: false }).eq("experience_id", item.id);
    await supabase.from("experience_images").update({ is_thumbnail: true }).eq("id", img.id);
    await supabase.from("experiences").update({ thumbnail_url: img.image_url }).eq("id", item.id);
    setImages((p) => p.map((i) => ({ ...i, is_thumbnail: i.id === img.id })));
  }

  async function addDate() {
    if (!item || !newDate) return;
    const { data, error } = await supabase.from("experience_dates")
      .insert({ experience_id: item.id, date: newDate, is_available: true }).select("*").single();
    if (error) { toast.error(error.message); return; }
    setDates((p) => [...p, data as ExpDate].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate("");
  }

  async function toggleDate(d: ExpDate) {
    await supabase.from("experience_dates").update({ is_available: !d.is_available }).eq("id", d.id);
    setDates((p) => p.map((x) => x.id === d.id ? { ...x, is_available: !x.is_available } : x));
  }

  async function removeDate(d: ExpDate) {
    await supabase.from("experience_dates").delete().eq("id", d.id);
    setDates((p) => p.filter((x) => x.id !== d.id));
  }

  return (
    <div className="space-y-4">
      <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div><Label>Duration (e.g. 2 hours)</Label><Input value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
      <div><Label>Meeting Point</Label><Input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} /></div>
      <div><Label>Pickup Information</Label><Textarea rows={2} value={pickupInfo} onChange={(e) => setPickupInfo(e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>

      {isEdit && (
        <>
          <div className="pt-4 border-t border-border">
            <Label>Images (click star to set thumbnail)</Label>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => (
                <div key={img.id} className={`relative aspect-square bg-muted rounded-md overflow-hidden group ring-2 ${img.is_thumbnail ? "ring-primary" : "ring-transparent"}`}>
                  {img.signed && <img src={img.signed} alt="" className="w-full h-full object-cover" />}
                  <button onClick={() => setThumb(img)} className={`absolute top-1 left-1 rounded-full p-1 ${img.is_thumbnail ? "bg-primary text-primary-foreground" : "bg-background/70 opacity-0 group-hover:opacity-100"}`}>
                    <Star className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeImage(img)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <label className="aspect-square border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-accent">
                <Upload className="w-4 h-4 mb-1" /> Add
                <input type="file" accept="image/*" multiple onChange={onUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Label>Available Dates</Label>
            <div className="flex gap-2 mb-2">
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              <Button variant="outline" onClick={addDate}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {dates.map((d) => (
                <span key={d.id} className={`inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs ${d.is_available ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground line-through"}`}>
                  {d.date}
                  <button onClick={() => toggleDate(d)} className="opacity-70 hover:opacity-100" title="Toggle availability">⇅</button>
                  <button onClick={() => removeDate(d)} className="opacity-70 hover:opacity-100 hover:text-destructive"><X className="w-3 h-3" /></button>
                </span>
              ))}
              {dates.length === 0 && <span className="text-xs text-muted-foreground">No dates set</span>}
            </div>
          </div>
        </>
      )}

      <div className="pt-4 border-t border-border">
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Textarea, Label, Drawer, Empty, Badge } from "@/components/admin/ui";
import { Plus, Trash2, Upload, X, Star } from "lucide-react";
import { uploadFile, deleteFile, getSignedUrls } from "@/lib/storage";
import { useSignedImage } from "@/hooks/use-signed-image";

const BUCKET = "experience-images";

type Experience = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  duration: string | null;
  meeting_point: string | null;
  pickup_info: string | null;
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
      const { data, error } = await supabase
        .from("experiences")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Experience[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["experiences"] });

  async function toggle(e: Experience) {
    const { error } = await supabase
      .from("experiences")
      .update({ is_active: !e.is_active })
      .eq("id", e.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Updated");
      refresh();
    }
  }

  async function del(e: Experience) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    const { data: imgs } = await supabase
      .from("experience_images")
      .select("image_url")
      .eq("experience_id", e.id);
    await Promise.all((imgs ?? []).map((i) => deleteFile(BUCKET, i.image_url)));
    const { error } = await supabase.from("experiences").delete().eq("id", e.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4" />
          Add experience
        </Button>
      </div>
      {items.length === 0 ? (
        <Card className="p-8">
          <Empty title="No experiences yet" />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((e) => (
            <Card key={e.id} className="overflow-hidden">
              <ExpThumbnail url={e.thumbnail_url} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold">{e.title}</h3>
                  <Badge variant={e.is_active ? "success" : "muted"}>
                    {e.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 mb-2 min-h-[3rem]">
                  {e.description ?? "No description"}
                </p>
                {e.duration && <p className="text-xs text-primary mb-3">⏱ {e.duration}</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(e)}>
                    {e.is_active ? "Hide" : "Show"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => del(e)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Edit experience">
        {editing && (
          <Form
            item={editing}
            onSaved={async () => {
              await refresh();
              setEditing(null);
            }}
          />
        )}
      </Drawer>
      <Drawer open={creating} onClose={() => setCreating(false)} title="New experience">
        <Form
          onSaved={async () => {
            await refresh();
            setCreating(false);
          }}
        />
      </Drawer>
    </div>
  );
}

type ExpImg = { id: string; image_url: string; signed: string | null; is_thumbnail: boolean };
type PendingImg = { file: File; preview: string; isThumbnail: boolean };
type ExpDate = { id?: string; date: string; is_available: boolean };

function ExpThumbnail({ url }: { url: string | null }) {
  const signed = useSignedImage(BUCKET, url);
  return (
    <div className="aspect-[16/10] bg-muted overflow-hidden">
      {signed ? (
        <img src={signed} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
          No image
        </div>
      )}
    </div>
  );
}

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
  const [pending, setPending] = useState<PendingImg[]>([]);
  const [dates, setDates] = useState<ExpDate[]>([]);
  const [newDate, setNewDate] = useState("");

  useEffect(() => {
    if (!item) return;
    (async () => {
      const [{ data: imgs }, { data: ds }] = await Promise.all([
        supabase
          .from("experience_images")
          .select("*")
          .eq("experience_id", item.id)
          .order("sort_order"),
        supabase.from("experience_dates").select("*").eq("experience_id", item.id).order("date"),
      ]);
      const paths = (imgs ?? []).map((i) => i.image_url);
      const signed = await getSignedUrls(BUCKET, paths);
      setImages(
        (imgs ?? []).map((i) => ({
          id: i.id,
          image_url: i.image_url,
          signed: signed[i.image_url] ?? null,
          is_thumbnail: i.is_thumbnail ?? false,
        })),
      );
      setDates((ds ?? []) as ExpDate[]);
    })();
  }, [item]);

  function selectFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const noThumb = images.every((i) => !i.is_thumbnail) && pending.every((p) => !p.isThumbnail);
    setPending((prev) => [
      ...prev,
      ...files.map((f, idx) => ({
        file: f,
        preview: URL.createObjectURL(f),
        isThumbnail: noThumb && idx === 0 && prev.length === 0,
      })),
    ]);
    e.target.value = "";
  }

  function removePending(idx: number) {
    setPending((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function setPendingThumb(idx: number) {
    setImages((p) => p.map((i) => ({ ...i, is_thumbnail: false })));
    setPending((p) => p.map((x, i) => ({ ...x, isThumbnail: i === idx })));
  }

  async function removeExisting(img: ExpImg) {
    await supabase.from("experience_images").delete().eq("id", img.id);
    await deleteFile(BUCKET, img.image_url);
    setImages((p) => p.filter((i) => i.id !== img.id));
  }

  async function setExistingThumb(img: ExpImg) {
    if (!item) return;
    await supabase
      .from("experience_images")
      .update({ is_thumbnail: false })
      .eq("experience_id", item.id);
    await supabase.from("experience_images").update({ is_thumbnail: true }).eq("id", img.id);
    await supabase.from("experiences").update({ thumbnail_url: img.image_url }).eq("id", item.id);
    setImages((p) => p.map((i) => ({ ...i, is_thumbnail: i.id === img.id })));
    setPending((p) => p.map((x) => ({ ...x, isThumbnail: false })));
  }

  function addPendingDate() {
    if (!newDate || dates.some((d) => d.date === newDate)) {
      setNewDate("");
      return;
    }
    setDates((p) =>
      [...p, { date: newDate, is_available: true }].sort((a, b) => a.date.localeCompare(b.date)),
    );
    setNewDate("");
  }

  function togglePendingDate(idx: number) {
    setDates((p) => p.map((d, i) => (i === idx ? { ...d, is_available: !d.is_available } : d)));
  }

  function removePendingDate(idx: number) {
    setDates((p) => p.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!title) return toast.error("Title required");
    setSaving(true);
    try {
      const payload = {
        title,
        description: description || null,
        is_active: isActive,
        duration: duration || null,
        meeting_point: meetingPoint || null,
        pickup_info: pickupInfo || null,
      };
      let expId = item?.id;
      if (isEdit) {
        const { error } = await supabase.from("experiences").update(payload).eq("id", item!.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("experiences")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        expId = data.id;
      }

      if (pending.length && expId) {
        let nextOrder = images.length;
        let thumbUrl: string | null = null;
        for (const p of pending) {
          const path = await uploadFile(BUCKET, p.file);
          const { error } = await supabase.from("experience_images").insert({
            experience_id: expId,
            image_url: path,
            sort_order: nextOrder++,
            is_thumbnail: p.isThumbnail,
          });
          if (error) throw error;
          if (p.isThumbnail) thumbUrl = path;
        }
        if (thumbUrl) {
          await supabase
            .from("experience_images")
            .update({ is_thumbnail: false })
            .eq("experience_id", expId)
            .neq("image_url", thumbUrl);
          await supabase.from("experiences").update({ thumbnail_url: thumbUrl }).eq("id", expId);
        }
      }

      // Sync dates
      if (expId) {
        const { data: current } = await supabase
          .from("experience_dates")
          .select("id, date, is_available")
          .eq("experience_id", expId);
        const currentMap = new Map((current ?? []).map((c) => [c.date, c]));
        const targetMap = new Map(dates.map((d) => [d.date, d]));
        const toDelete = (current ?? []).filter((c) => !targetMap.has(c.date)).map((c) => c.id);
        const toInsert = dates
          .filter((d) => !currentMap.has(d.date))
          .map((d) => ({ experience_id: expId!, date: d.date, is_available: d.is_available }));
        const toUpdate = dates.filter((d) => {
          const c = currentMap.get(d.date);
          return c && c.is_available !== d.is_available;
        });
        if (toDelete.length) await supabase.from("experience_dates").delete().in("id", toDelete);
        if (toInsert.length) await supabase.from("experience_dates").insert(toInsert);
        for (const u of toUpdate) {
          const c = currentMap.get(u.date)!;
          await supabase
            .from("experience_dates")
            .update({ is_available: u.is_available })
            .eq("id", c.id);
        }
      }

      toast.success("Saved");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Title *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <Label>Duration (e.g. 2 hours)</Label>
        <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
      </div>
      <div>
        <Label>Meeting Point</Label>
        <Input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} />
      </div>
      <div>
        <Label>Pickup Information</Label>
        <Textarea rows={2} value={pickupInfo} onChange={(e) => setPickupInfo(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>

      <div className="pt-4 border-t border-border">
        <Label>Images (click star to set thumbnail)</Label>
        <div className="grid grid-cols-3 gap-2">
          {images.map((img) => (
            <div
              key={img.id}
              className={`relative aspect-square bg-muted rounded-md overflow-hidden group ring-2 ${img.is_thumbnail ? "ring-primary" : "ring-transparent"}`}
            >
              {img.signed && <img src={img.signed} alt="" className="w-full h-full object-cover" />}
              <button
                type="button"
                onClick={() => setExistingThumb(img)}
                className={`absolute top-1 left-1 rounded-full p-1 ${img.is_thumbnail ? "bg-primary text-primary-foreground" : "bg-background/70 opacity-0 group-hover:opacity-100"}`}
              >
                <Star className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => removeExisting(img)}
                aria-label="Remove image"
                className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {pending.map((p, idx) => (
            <div
              key={idx}
              className={`relative aspect-square bg-muted rounded-md overflow-hidden group ring-2 ${p.isThumbnail ? "ring-primary" : "ring-dashed ring-border"}`}
            >
              <img src={p.preview} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-1 right-1 text-[9px] bg-background/80 px-1 rounded">
                New
              </span>
              <button
                type="button"
                onClick={() => setPendingThumb(idx)}
                className={`absolute top-1 left-1 rounded-full p-1 ${p.isThumbnail ? "bg-primary text-primary-foreground" : "bg-background/70 opacity-0 group-hover:opacity-100"}`}
              >
                <Star className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => removePending(idx)}
                aria-label="Remove image"
                className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <label className="aspect-square border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-accent">
            <Upload className="w-4 h-4 mb-1" /> Add
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={selectFiles}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <Label>Available Dates</Label>
        <div className="flex gap-2 mb-2">
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          <Button type="button" variant="outline" onClick={addPendingDate}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {dates.map((d, idx) => (
            <span
              key={d.date}
              className={`inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs ${d.is_available ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground line-through"}`}
            >
              {d.date}
              <button
                type="button"
                onClick={() => togglePendingDate(idx)}
                className="opacity-70 hover:opacity-100"
                title="Toggle availability"
              >
                ⇅
              </button>
              <button
                type="button"
                onClick={() => removePendingDate(idx)}
                className="opacity-70 hover:opacity-100 hover:text-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {dates.length === 0 && (
            <span className="text-xs text-muted-foreground">No dates set</span>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save" : "Create experience"}
        </Button>
      </div>
    </div>
  );
}

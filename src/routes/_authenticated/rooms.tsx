import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Textarea, Label, Drawer, Empty, Badge } from "@/components/admin/ui";
import { Plus, Trash2, Upload, X, Star, CalendarDays } from "lucide-react";
import { uploadFile, deleteFile, getSignedUrls } from "@/lib/storage";

const BUCKET = "room-images";

type Room = {
  id: string; name: string; description: string | null; price: number;
  guests: number; beds: number; is_active: boolean; thumbnail_url: string | null;
};

export const Route = createFileRoute("/_authenticated/rooms")({
  component: RoomsPage,
});

function RoomsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rooms = [] } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["rooms"] });
    await qc.invalidateQueries({ queryKey: ["rooms-min"] });
  }

  async function toggleActive(r: Room) {
    const { error } = await supabase.from("rooms").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success("Updated"); refresh(); }
  }

  async function deleteRoom(r: Room) {
    if (!confirm(`Delete "${r.name}"? This also removes its images and amenities.`)) return;
    const { data: imgs } = await supabase.from("room_images").select("image_url").eq("room_id", r.id);
    await Promise.all((imgs ?? []).map((i) => deleteFile(BUCKET, i.image_url)));
    const { error } = await supabase.from("rooms").delete().eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success("Room deleted"); refresh(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4" />Add room</Button>
      </div>

      {rooms.length === 0 ? <Card className="p-8"><Empty title="No rooms yet" hint="Click 'Add room' to get started." /></Card> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold">{r.name}</h3>
                <Badge variant={r.is_active ? "success" : "muted"}>{r.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">{r.description ?? "No description"}</p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <span><span className="text-primary font-semibold">${r.price}</span> / night</span>
                <span>{r.guests} guests</span>
                <span>{r.beds} {r.beds === 1 ? "bed" : "beds"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit</Button>
                <Link to="/rooms/$id/calendar" params={{ id: r.id }}>
                  <Button size="sm" variant="outline"><CalendarDays className="w-4 h-4" />Calendar</Button>
                </Link>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(r)}>{r.is_active ? "Deactivate" : "Activate"}</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteRoom(r)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Edit room">
        {editing && <RoomForm room={editing} onSaved={async () => { await refresh(); setEditing(null); }} />}
      </Drawer>
      <Drawer open={creating} onClose={() => setCreating(false)} title="New room">
        <RoomForm onSaved={async () => { await refresh(); setCreating(false); }} />
      </Drawer>
    </div>
  );
}

function RoomForm({ room, onSaved }: { room?: Room; onSaved: () => void }) {
  const isEdit = !!room;
  const [name, setName] = useState(room?.name ?? "");
  const [description, setDescription] = useState(room?.description ?? "");
  const [price, setPrice] = useState(room?.price?.toString() ?? "0");
  const [guests, setGuests] = useState(room?.guests?.toString() ?? "2");
  const [beds, setBeds] = useState(room?.beds?.toString() ?? "1");
  const [isActive, setIsActive] = useState(room?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const [images, setImages] = useState<{ id: string; image_url: string; signed: string | null; is_thumbnail: boolean }[]>([]);
  const [amenities, setAmenities] = useState<{ id: string; amenity: string }[]>([]);
  const [newAmenity, setNewAmenity] = useState("");

  useEffect(() => {
    if (!room) return;
    (async () => {
      const [{ data: imgs }, { data: ams }] = await Promise.all([
        supabase.from("room_images").select("*").eq("room_id", room.id).order("sort_order"),
        supabase.from("room_amenities").select("*").eq("room_id", room.id),
      ]);
      const paths = (imgs ?? []).map((i) => i.image_url);
      const signedMap = await getSignedUrls(BUCKET, paths);
      setImages((imgs ?? []).map((i) => ({
        id: i.id, image_url: i.image_url, signed: signedMap[i.image_url] ?? null,
        is_thumbnail: i.is_thumbnail ?? false,
      })));
      setAmenities(ams ?? []);
    })();
  }, [room]);

  async function save() {
    if (!name) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const payload = { name, description: description || null, price: Number(price), guests: Number(guests), beds: Number(beds), is_active: isActive };
      if (isEdit) {
        const { error } = await supabase.from("rooms").update(payload).eq("id", room!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rooms").insert(payload);
        if (error) throw error;
      }
      toast.success(isEdit ? "Room saved" : "Room created");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!room) { toast.error("Save the room first to add images"); return; }
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    try {
      let nextOrder = images.length;
      for (const f of files) {
        const path = await uploadFile(BUCKET, f);
        const { data, error } = await supabase.from("room_images")
          .insert({ room_id: room.id, image_url: path, sort_order: nextOrder++ })
          .select("*").single();
        if (error) throw error;
        const signed = await getSignedUrls(BUCKET, [path]);
        setImages((prev) => [...prev, { id: data.id, image_url: path, signed: signed[path] ?? null, is_thumbnail: false }]);
      }
      toast.success("Images uploaded");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
    e.target.value = "";
  }

  async function removeImage(img: { id: string; image_url: string }) {
    await supabase.from("room_images").delete().eq("id", img.id);
    await deleteFile(BUCKET, img.image_url);
    setImages((prev) => prev.filter((i) => i.id !== img.id));
  }

  async function setThumbnail(img: { id: string; image_url: string }) {
    if (!room) return;
    await supabase.from("room_images").update({ is_thumbnail: false }).eq("room_id", room.id);
    await supabase.from("room_images").update({ is_thumbnail: true }).eq("id", img.id);
    await supabase.from("rooms").update({ thumbnail_url: img.image_url }).eq("id", room.id);
    setImages((prev) => prev.map((i) => ({ ...i, is_thumbnail: i.id === img.id })));
    toast.success("Thumbnail set");
  }

  async function addAmenity() {
    if (!room || !newAmenity.trim()) return;
    const { data, error } = await supabase.from("room_amenities").insert({ room_id: room.id, amenity: newAmenity.trim() }).select("*").single();
    if (error) { toast.error(error.message); return; }
    setAmenities((prev) => [...prev, data]);
    setNewAmenity("");
  }

  async function removeAmenity(id: string) {
    await supabase.from("room_amenities").delete().eq("id", id);
    setAmenities((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-4">
      <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><Label>Price / night</Label><Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div><Label>Guests</Label><Input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)} /></div>
        <div><Label>Beds</Label><Input type="number" min="1" value={beds} onChange={(e) => setBeds(e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-[color:var(--primary)]" />
        Active (visible on website)
      </label>

      {isEdit && (
        <>
          <div className="pt-4 border-t border-border">
            <Label>Images (click star to set thumbnail)</Label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {images.map((img) => (
                <div key={img.id} className={`relative aspect-square bg-muted rounded-md overflow-hidden group ring-2 ${img.is_thumbnail ? "ring-primary" : "ring-transparent"}`}>
                  {img.signed && <img src={img.signed} alt="" className="w-full h-full object-cover" />}
                  <button onClick={() => setThumbnail(img)} className={`absolute top-1 left-1 rounded-full p-1 ${img.is_thumbnail ? "bg-primary text-primary-foreground" : "bg-background/70 text-foreground opacity-0 group-hover:opacity-100"}`}>
                    <Star className="w-3 h-3" />
                  </button>
                  <button onClick={() => removeImage(img)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="aspect-square border-2 border-dashed border-border rounded-md flex flex-col items-center justify-center text-xs text-muted-foreground cursor-pointer hover:bg-accent">
                <Upload className="w-4 h-4 mb-1" /> Add
                <input type="file" accept="image/*" multiple onChange={onUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Label>Amenities</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {amenities.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs">
                  {a.amenity}
                  <button onClick={() => removeAmenity(a.id)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newAmenity} onChange={(e) => setNewAmenity(e.target.value)} placeholder="e.g. Wi-Fi" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAmenity())} />
              <Button variant="outline" onClick={addAmenity}>Add</Button>
            </div>
          </div>
        </>
      )}

      <div className="pt-4 border-t border-border">
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : isEdit ? "Save room" : "Create room"}</Button>
      </div>
      {!isEdit && <p className="text-xs text-muted-foreground">Create the room first, then add images, amenities and manage availability.</p>}
    </div>
  );
}

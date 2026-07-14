import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Textarea, Label, Drawer, Empty, Badge } from "@/components/admin/ui";
import { Plus, Trash2, Star, Upload } from "lucide-react";
import { useSignedImage } from "@/hooks/use-signed-image";
import { uploadFile, deleteFile } from "@/lib/storage";

const BUCKET = "review-images";
const REVIEW_TEXT_MAX = 240;

function truncateText(text: string | null, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

// Generic flat "no photo" placeholder — a black silhouette user glyph on a
// light neutral circle, matching the classic default-profile icon look.
function PersonSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.6" fill="currentColor" />
      <path d="M4 20.2c0-4.6 3.6-7.4 8-7.4s8 2.8 8 7.4" fill="currentColor" />
    </svg>
  );
}

function GuestAvatar({
  name,
  imgUrl,
  className,
}: {
  name: string;
  imgUrl?: string | null;
  className?: string;
}) {
  if (imgUrl) {
    return (
      <div className={`rounded-full overflow-hidden flex-shrink-0 ${className ?? ""}`}>
        <img src={imgUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={`rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center bg-muted ${className ?? ""}`}
      role="img"
      aria-label={name}
    >
      <PersonSilhouette className="w-[68%] h-[68%] text-muted-foreground/70" />
    </div>
  );
}

type Review = {
  id: string;
  guest_name: string;
  rating: number;
  review_text: string | null;
  image_url: string | null;
  is_visible: boolean;
};

export const Route = createFileRoute("/_authenticated/reviews")({
  component: ReviewsPage,
});

function ReviewsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Review | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: reviews = [] } = useQuery({
    queryKey: ["reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["reviews"] });

  async function toggle(r: Review) {
    const { error } = await supabase
      .from("reviews")
      .update({ is_visible: !r.is_visible })
      .eq("id", r.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Updated");
      refresh();
    }
  }

  async function del(r: Review) {
    if (!confirm("Delete this review?")) return;
    if (r.image_url) await deleteFile(BUCKET, r.image_url);
    const { error } = await supabase.from("reviews").delete().eq("id", r.id);
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
          Add review
        </Button>
      </div>
      {reviews.length === 0 ? (
        <Card className="p-8">
          <Empty title="No reviews yet" />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {reviews.map((r) => (
            <ReviewCard
              key={r.id}
              r={r}
              onEdit={() => setEditing(r)}
              onToggle={() => toggle(r)}
              onDelete={() => del(r)}
            />
          ))}
        </div>
      )}
      <Drawer open={!!editing} onClose={() => setEditing(null)} title="Edit review">
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
      <Drawer open={creating} onClose={() => setCreating(false)} title="New review">
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

function ReviewCard({
  r,
  onEdit,
  onToggle,
  onDelete,
}: {
  r: Review;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const img = useSignedImage(BUCKET, r.image_url);
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <GuestAvatar name={r.guest_name} imgUrl={img} className="w-12 h-12" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="font-semibold truncate">{r.guest_name}</div>
            <Badge variant={r.is_visible ? "success" : "muted"}>
              {r.is_visible ? "Visible" : "Hidden"}
            </Badge>
          </div>
          <div className="flex items-center gap-1 mb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${i < r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`}
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-3 mb-3 break-words">
            {truncateText(r.review_text, REVIEW_TEXT_MAX)}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onToggle}>
              {r.is_visible ? "Hide" : "Show"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Form({ item, onSaved }: { item?: Review; onSaved: () => void }) {
  const isEdit = !!item;
  const [guestName, setGuestName] = useState(item?.guest_name ?? "");
  const [rating, setRating] = useState(item?.rating ?? 5);
  const [text, setText] = useState(item?.review_text ?? "");
  const [imagePath, setImagePath] = useState<string | null>(item?.image_url ?? null);
  const [isVisible, setIsVisible] = useState(item?.is_visible ?? true);
  const [saving, setSaving] = useState(false);
  const imgUrl = useSignedImage(BUCKET, imagePath);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      if (imagePath) await deleteFile(BUCKET, imagePath);
      const path = await uploadFile(BUCKET, f);
      setImagePath(path);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
    e.target.value = "";
  }

  async function save() {
    if (!guestName) return toast.error("Guest name required");
    setSaving(true);
    try {
      const payload = {
        guest_name: guestName,
        rating,
        review_text: text || null,
        image_url: imagePath,
        is_visible: isVisible,
      };
      if (isEdit) {
        const { error } = await supabase.from("reviews").update(payload).eq("id", item!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reviews").insert(payload);
        if (error) throw error;
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
        <Label>Guest name *</Label>
        <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
      </div>
      <div>
        <Label>Rating</Label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)}>
              <Star
                className={`w-6 h-6 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`}
              />
            </button>
          ))}
        </div>
      </div>
      <div>
        <Label>Review text</Label>
        <Textarea
          rows={4}
          value={text}
          maxLength={REVIEW_TEXT_MAX}
          onChange={(e) => setText(e.target.value.slice(0, REVIEW_TEXT_MAX))}
        />
        <div className="text-xs text-muted-foreground mt-1 text-right">
          {text.length}/{REVIEW_TEXT_MAX}
        </div>
      </div>
      <div>
        <Label>Guest photo</Label>
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center">
            {imgUrl ? (
              <img src={imgUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Upload className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <label className="text-sm text-primary cursor-pointer hover:underline">
            Upload photo
            <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
          </label>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isVisible}
          onChange={(e) => setIsVisible(e.target.checked)}
        />
        Visible on website
      </label>
      <div className="pt-4 border-t border-border">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save review"}
        </Button>
      </div>
    </div>
  );
}

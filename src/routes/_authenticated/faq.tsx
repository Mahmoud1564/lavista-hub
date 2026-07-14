import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, Button, Input, Textarea, Empty } from "@/components/admin/ui";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

type Faq = { id: string; question: string; answer: string; sort_order: number };

export const Route = createFileRoute("/_authenticated/faq")({
  component: FaqPage,
});

function FaqPage() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["faq"],
    queryFn: async () => {
      const { data, error } = await supabase.from("faq").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Faq[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["faq"] });

  async function add() {
    if (!q || !a) return toast.error("Question and answer required");
    const order = items.length;
    const { error } = await supabase
      .from("faq")
      .insert({ question: q, answer: a, sort_order: order });
    if (error) toast.error(error.message);
    else {
      toast.success("Added");
      setQ("");
      setA("");
      setAdding(false);
      refresh();
    }
  }

  async function update(id: string, patch: Partial<Faq>) {
    const { error } = await supabase.from("faq").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  }

  async function del(id: string) {
    if (!confirm("Delete this FAQ?")) return;
    const { error } = await supabase.from("faq").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      refresh();
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= items.length) return;
    const a = items[idx],
      b = items[next];
    await supabase.from("faq").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("faq").update({ sort_order: a.sort_order }).eq("id", b.id);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(!adding)}>
          <Plus className="w-4 h-4" />
          {adding ? "Cancel" : "Add FAQ"}
        </Button>
      </div>

      {adding && (
        <Card className="p-5 space-y-3">
          <Input placeholder="Question" value={q} onChange={(e) => setQ(e.target.value)} />
          <Textarea
            rows={3}
            placeholder="Answer"
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
          <Button onClick={add}>Save FAQ</Button>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="p-8">
          <Empty title="No FAQs yet" />
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((f, i) => (
            <Card key={f.id} className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    defaultValue={f.question}
                    onBlur={(e) =>
                      e.target.value !== f.question && update(f.id, { question: e.target.value })
                    }
                  />
                  <Textarea
                    defaultValue={f.answer}
                    rows={2}
                    onBlur={(e) =>
                      e.target.value !== f.answer && update(f.id, { answer: e.target.value })
                    }
                  />
                </div>
                <Button size="sm" variant="ghost" onClick={() => del(f.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Cat {
  id: string;
  name: string;
  description: string | null;
  itilMapping: string | null;
  isActive: boolean;
}

export function CategoriesManager({ initial }: { initial: Cat[] }) {
  const [cats, setCats] = useState(initial);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [itil, setItil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          itilMapping: itil.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add category.");
        return;
      }
      setCats((prev) => [...prev, data.category]);
      setName("");
      setDescription("");
      setItil("");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (cat: Cat) => {
    const res = await fetch("/api/admin/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cat.id, isActive: !cat.isActive }),
    });
    if (res.ok) {
      setCats((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, isActive: !c.isActive } : c)),
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="mb-3 text-sm font-medium text-ink">Add a category</h3>
        {error && <p className="mb-2 text-sm text-orange">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            className="input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <input
            className="input"
            placeholder="ITIL mapping (optional)"
            value={itil}
            onChange={(e) => setItil(e.target.value)}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={add} disabled={busy || !name.trim()} className="btn-primary text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add category
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-inset text-left text-xs uppercase tracking-wide text-ink-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">ITIL mapping</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cats.map((c) => (
                <tr key={c.id} className={cn("hover:bg-surface-muted", !c.isActive && "opacity-60")}>
                  <td className="px-4 py-2.5 font-medium text-ink">{c.name}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{c.description ?? "—"}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{c.itilMapping ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {c.isActive ? (
                      <span className="badge bg-success/15 text-[rgb(80,120,30)]">Active</span>
                    ) : (
                      <span className="badge bg-surface-inset text-ink-muted">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => toggleActive(c)} className="btn-ghost px-2 py-1 text-xs">
                      {c.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

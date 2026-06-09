"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

interface ConvoRow {
  id: string;
  title: string;
  status: string;
  startedAt: string;
  categoryId: string | null;
}

export function RecentConversations({
  conversations,
  categories,
}: {
  conversations: ConvoRow[];
  categories: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState(conversations);
  const [busy, setBusy] = useState<string | null>(null);

  const recategorise = async (id: string, categoryId: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/conversations/${id}/categorise`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: categoryId || null }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, categoryId: categoryId || null } : r,
          ),
        );
      }
    } finally {
      setBusy(null);
    }
  };

  if (!rows.length) {
    return (
      <p className="px-4 py-6 text-center text-sm text-ink-subtle">
        No conversations yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-inset text-left text-xs uppercase tracking-wide text-ink-subtle">
          <tr>
            <th className="px-4 py-2 font-medium">Title</th>
            <th className="px-4 py-2 font-medium">Started</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Category</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-surface-muted">
              <td className="max-w-xs truncate px-4 py-2.5 font-medium text-ink">
                {c.title}
              </td>
              <td className="px-4 py-2.5 text-ink-muted">
                {formatDate(c.startedAt)}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge status={c.status} />
              </td>
              <td className="px-4 py-2.5">
                <select
                  className="input py-1 text-xs"
                  value={c.categoryId ?? ""}
                  disabled={busy === c.id}
                  onChange={(e) => recategorise(c.id, e.target.value)}
                >
                  <option value="">Uncategorised</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

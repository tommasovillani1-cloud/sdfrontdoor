"use client";

import { useState } from "react";
import { ShieldCheck, Shield, Trash2, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  site: string | null;
  isAdmin: boolean;
  lastSeenAt: string;
}

export function UsersTable({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleAdmin = async (user: UserRow) => {
    setBusy(user.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, isAdmin: !user.isAdmin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to update.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isAdmin: !u.isAdmin } : u)),
      );
    } finally {
      setBusy(null);
    }
  };

  const eraseConversations = async (user: UserRow) => {
    if (
      !confirm(
        `Erase ALL conversations for ${user.email}? This is permanent (GDPR erasure).`,
      )
    )
      return;
    setBusy(user.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/users/${user.id}/conversations`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError("Failed to erase conversations.");
        return;
      }
      const data = await res.json();
      alert(`Erased ${data.deleted} conversation(s) for ${user.email}.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      {error && (
        <div className="border-b border-line bg-orange/5 px-4 py-2 text-sm text-orange">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-inset text-left text-xs uppercase tracking-wide text-ink-subtle">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Site</th>
              <th className="px-4 py-2 font-medium">Last seen</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-surface-muted">
                <td className="px-4 py-2.5 font-medium text-ink">
                  {u.displayName ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-ink-muted">{u.email}</td>
                <td className="px-4 py-2.5 text-ink-muted">{u.site ?? "Unknown"}</td>
                <td className="px-4 py-2.5 text-ink-muted">
                  {formatDateTime(u.lastSeenAt)}
                </td>
                <td className="px-4 py-2.5">
                  {u.isAdmin ? (
                    <span className="badge bg-orange/10 text-orange">
                      <ShieldCheck className="h-3 w-3" />
                      Admin
                    </span>
                  ) : (
                    <span className="badge bg-surface-inset text-ink-muted">
                      User
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => toggleAdmin(u)}
                      disabled={busy === u.id}
                      className="btn-ghost px-2 py-1 text-xs"
                      title={u.isAdmin ? "Demote to user" : "Promote to admin"}
                    >
                      {busy === u.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : u.isAdmin ? (
                        <Shield className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {u.isAdmin ? "Demote" : "Promote"}
                    </button>
                    <button
                      onClick={() => eraseConversations(u)}
                      disabled={busy === u.id}
                      className="btn-ghost px-2 py-1 text-xs text-orange hover:bg-orange/5"
                      title="Erase all conversations (GDPR)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

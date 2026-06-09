"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, History, RotateCcw } from "lucide-react";

interface Version {
  id: string;
  content: string;
  editedBy: string | null;
  note: string | null;
  createdAt: string;
}

export function SystemPromptEditor({
  initial,
  history,
}: {
  initial: string;
  history: Version[];
}) {
  const router = useRouter();
  const [content, setContent] = useState(initial);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = content !== initial;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/system-prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save.");
        return;
      }
      setSaved(true);
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const restore = (v: Version) => {
    setContent(v.content);
    setNote(`Restored version from ${v.createdAt}`);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="card p-4">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSaved(false);
            }}
            rows={20}
            className="input font-mono text-xs leading-relaxed"
            aria-label="System prompt"
          />
          <div className="mt-3 flex items-end justify-between gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-medium text-ink-muted">
                Change note (optional)
              </span>
              <input
                className="input"
                placeholder="What did you change and why?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              onClick={save}
              disabled={busy || !dirty}
              className="btn-primary text-sm"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save new version
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-orange">{error}</p>}
          {saved && (
            <p className="mt-2 text-sm text-[rgb(80,120,30)]">
              Saved. The assistant will use this on the next message.
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="card overflow-hidden">
          <h3 className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            <History className="h-4 w-4" />
            Version history
          </h3>
          <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
            {history.map((v) => (
              <li key={v.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-ink">{v.createdAt}</p>
                  <button
                    onClick={() => restore(v)}
                    className="btn-ghost px-2 py-1 text-xs"
                    title="Load this version into the editor"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {v.editedBy ?? "unknown"}
                </p>
                {v.note && (
                  <p className="mt-1 text-xs italic text-ink-subtle">
                    {v.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FolderPlus,
  Folder,
  FolderOpen,
  Upload,
  RefreshCw,
  Loader2,
  FileText,
  Trash2,
  Power,
  RotateCw,
  ChevronRight,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  SYNC_CADENCES,
  SYNC_CADENCE_LABELS,
  type SyncCadence,
} from "@/lib/constants";

interface FolderNode {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  children: FolderNode[];
  documentCount: number;
}

interface KbDoc {
  id: string;
  originalFilename: string;
  volumePath: string;
  version: number;
  isActive: boolean;
  status: string;
  categoryId: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
  lastReviewed: string | null;
  owner: string | null;
  errorMessage: string | null;
}

export function KnowledgeBaseManager({
  initialTree,
  cadence,
  lastSyncAt,
  indexConfigured,
  volumeConfigured,
  categories,
}: {
  initialTree: FolderNode[];
  cadence: SyncCadence;
  lastSyncAt: string | null;
  indexConfigured: boolean;
  volumeConfigured: boolean;
  categories: { id: string; name: string }[];
}) {
  const [tree, setTree] = useState(initialTree);
  const [selected, setSelected] = useState<FolderNode | null>(null);
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [currentCadence, setCurrentCadence] = useState(cadence);
  const [lastSync, setLastSync] = useState(lastSyncAt);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshTree = useCallback(async () => {
    const res = await fetch("/api/admin/kb/folders");
    if (res.ok) {
      const data = await res.json();
      setTree(data.tree ?? []);
    }
  }, []);

  const loadDocs = useCallback(async (folderId: string) => {
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/admin/kb/documents?folderId=${folderId}`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents ?? []);
      }
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadDocs(selected.id);
    else setDocs([]);
  }, [selected, loadDocs]);

  const addFolder = async (parentId: string | null) => {
    const name = prompt(
      parentId ? "New subfolder name" : "New top-level folder name",
    );
    if (!name?.trim()) return;
    const res = await fetch("/api/admin/kb/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), parentId }),
    });
    if (res.ok) await refreshTree();
  };

  const renameFolder = async (folder: FolderNode) => {
    const name = prompt("Rename folder", folder.name);
    if (!name?.trim() || name === folder.name) return;
    const res = await fetch("/api/admin/kb/folders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: folder.id, name: name.trim() }),
    });
    if (res.ok) await refreshTree();
  };

  const deleteFolder = async (folder: FolderNode) => {
    if (
      !confirm(
        `Delete folder "${folder.name}" and everything inside it? This cannot be undone.`,
      )
    )
      return;
    const res = await fetch(`/api/admin/kb/folders?id=${folder.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      if (selected?.id === folder.id) setSelected(null);
      await refreshTree();
    }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("folderId", selected.id);
      form.set("file", file);
      const res = await fetch("/api/admin/kb/documents", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        if (data.notes) setNotice(data.notes);
        await loadDocs(selected.id);
        await refreshTree();
      } else {
        setNotice(data.error ?? "Upload failed.");
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const toggleDoc = async (doc: KbDoc) => {
    const res = await fetch(`/api/admin/kb/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !doc.isActive }),
    });
    if (res.ok && selected) loadDocs(selected.id);
  };

  const setDocCategory = async (doc: KbDoc, categoryId: string) => {
    const res = await fetch(`/api/admin/kb/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: categoryId || null }),
    });
    if (res.ok && selected) loadDocs(selected.id);
  };

  const reprocess = async (doc: KbDoc) => {
    const res = await fetch(`/api/admin/kb/documents/${doc.id}`, {
      method: "POST",
    });
    if (res.ok && selected) loadDocs(selected.id);
  };

  const deleteDoc = async (doc: KbDoc) => {
    if (!confirm(`Delete "${doc.originalFilename}"?`)) return;
    const res = await fetch(`/api/admin/kb/documents/${doc.id}`, {
      method: "DELETE",
    });
    if (res.ok && selected) {
      loadDocs(selected.id);
      refreshTree();
    }
  };

  const changeCadence = async (c: SyncCadence) => {
    setCurrentCadence(c);
    await fetch("/api/admin/kb/sync", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cadence: c }),
    });
  };

  const syncNow = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/kb/sync", { method: "POST" });
      const data = await res.json();
      if (data.lastSyncAt) setLastSync(data.lastSyncAt);
      if (data.note) setNotice(data.note);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sync controls */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-ink">Index sync</h3>
            <p className="text-xs text-ink-muted">
              Last successful sync:{" "}
              {lastSync ? formatDateTime(lastSync) : "never"}
              {!indexConfigured && " (AI Search index not provisioned)"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-muted">Cadence</label>
            <select
              className="input w-auto py-1.5 text-sm"
              value={currentCadence}
              onChange={(e) => changeCadence(e.target.value as SyncCadence)}
            >
              {SYNC_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {SYNC_CADENCE_LABELS[c]}
                </option>
              ))}
            </select>
            <button onClick={syncNow} disabled={syncing} className="btn-secondary text-sm">
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync now
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div className="rounded-card border border-vivid/40 bg-vivid/10 px-4 py-2 text-xs text-ink-muted">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Folder tree */}
        <div className="card p-3 lg:col-span-1">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">Folders</h3>
            <button
              onClick={() => addFolder(null)}
              className="btn-ghost px-2 py-1 text-xs"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New
            </button>
          </div>
          {tree.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-ink-subtle">
              No folders yet. Create one to start.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {tree.map((node) => (
                <FolderTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelected}
                  onAddChild={addFolder}
                  onRename={renameFolder}
                  onDelete={deleteFolder}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Documents */}
        <div className="card p-4 lg:col-span-2">
          {!selected ? (
            <p className="py-12 text-center text-sm text-ink-subtle">
              Select a folder to view and upload documents.
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium text-ink">
                    {selected.name}
                  </h3>
                  <p className="truncate text-xs text-ink-subtle">
                    {selected.path}
                  </p>
                </div>
                <label className="btn-primary cursor-pointer text-sm">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    onChange={onUpload}
                    disabled={uploading}
                  />
                </label>
              </div>

              {!volumeConfigured && (
                <p className="mb-3 rounded-lg bg-surface-inset px-3 py-2 text-xs text-ink-muted">
                  Databricks Volume is not configured. Uploads are recorded in
                  the registry so you can see the flow, but files are not stored
                  or processed until KB_* values are set.
                </p>
              )}

              {loadingDocs ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-ink-subtle" />
                </div>
              ) : docs.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-subtle">
                  No documents in this folder yet.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {docs.map((doc) => (
                    <li key={doc.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink">
                              {doc.originalFilename}
                            </span>
                            {doc.version > 1 && (
                              <span className="badge bg-surface-inset text-ink-subtle">
                                v{doc.version}
                              </span>
                            )}
                            <DocStatusBadge status={doc.status} />
                            {!doc.isActive && (
                              <span className="badge bg-surface-inset text-ink-muted">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-ink-subtle">
                            Uploaded {formatDateTime(doc.uploadedAt)}
                            {doc.uploadedBy ? ` by ${doc.uploadedBy}` : ""}
                            {doc.owner ? ` · owner ${doc.owner}` : ""}
                          </p>
                          {doc.errorMessage && (
                            <p className="mt-1 text-xs text-orange">
                              {doc.errorMessage}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <select
                              className="input w-auto py-1 text-xs"
                              value={doc.categoryId ?? ""}
                              onChange={(e) => setDocCategory(doc, e.target.value)}
                            >
                              <option value="">No category</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => toggleDoc(doc)}
                              className="btn-ghost px-2 py-1 text-xs"
                            >
                              <Power className="h-3.5 w-3.5" />
                              {doc.isActive ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              onClick={() => reprocess(doc)}
                              className="btn-ghost px-2 py-1 text-xs"
                            >
                              <RotateCw className="h-3.5 w-3.5" />
                              Reprocess
                            </button>
                            <button
                              onClick={() => deleteDoc(doc)}
                              className="btn-ghost px-2 py-1 text-xs text-orange hover:bg-orange/5"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderTreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onRename,
  onDelete,
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (n: FolderNode) => void;
  onAddChild: (parentId: string) => void;
  onRename: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
}) {
  const [open, setOpen] = useState(true);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
          isSelected ? "bg-orange/10 text-orange" : "text-ink hover:bg-surface-inset",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn("shrink-0", !hasChildren && "invisible")}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")}
          />
        </button>
        <button
          onClick={() => onSelect(node)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {isSelected ? (
            <FolderOpen className="h-4 w-4 shrink-0" />
          ) : (
            <Folder className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
          {node.documentCount > 0 && (
            <span className="ml-1 text-xs text-ink-subtle">
              {node.documentCount}
            </span>
          )}
        </button>
        <div className="hidden shrink-0 gap-0.5 group-hover:flex">
          <button
            onClick={() => onAddChild(node.id)}
            className="rounded p-0.5 text-ink-subtle hover:text-ink"
            title="Add subfolder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onRename(node)}
            className="rounded p-0.5 text-ink-subtle hover:text-ink"
            title="Rename"
          >
            <span className="text-xs">Aa</span>
          </button>
          <button
            onClick={() => onDelete(node)}
            className="rounded p-0.5 text-ink-subtle hover:text-orange"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {open && hasChildren && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function DocStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-vivid/20 text-[rgb(150,115,0)]",
    processed: "bg-success/15 text-[rgb(80,120,30)]",
    error: "bg-orange/10 text-orange",
  };
  return (
    <span className={cn("badge", map[status] ?? "bg-surface-inset text-ink-muted")}>
      {status}
    </span>
  );
}

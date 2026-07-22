"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Folder,
  FolderOpen,
  RefreshCw,
  Loader2,
  ChevronRight,
  Check,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  SYNC_CADENCES,
  SYNC_CADENCE_LABELS,
  type SyncCadence,
} from "@/lib/constants";

interface SelectedSource {
  id: string;
  siteId: string;
  siteName: string;
  driveId: string;
  driveName: string;
  folderItemId: string;
  folderPath: string;
  folderName: string;
  includeSubfolders: boolean;
  selectedBy: string | null;
  selectedAt: string;
}

interface SiteItem {
  id: string;
  name: string;
  webUrl: string;
}
interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
}
interface FolderItem {
  id: string;
  name: string;
  childCount: number;
}

/** A step in the folder drill-down: the folder we are inside (root when null). */
interface Crumb {
  itemId: string | null;
  name: string;
}

export function KnowledgeBaseManager({
  initialSources,
  cadence,
  lastSyncAt,
  indexConfigured,
  browseConfigured,
}: {
  initialSources: SelectedSource[];
  cadence: SyncCadence;
  lastSyncAt: string | null;
  indexConfigured: boolean;
  browseConfigured: boolean;
}) {
  const [sources, setSources] = useState<SelectedSource[]>(initialSources);
  // Show the picker inline when there are no sources yet, or when the admin
  // explicitly clicks "Add folder".
  const [adding, setAdding] = useState(initialSources.length === 0);

  const [currentCadence, setCurrentCadence] = useState(cadence);
  const [lastSync, setLastSync] = useState(lastSyncAt);
  // Sync lifecycle: idle -> syncing (triggering + polling runs) -> success|failed.
  const [syncState, setSyncState] = useState<
    "idle" | "syncing" | "success" | "failed"
  >("idle");
  const [notice, setNotice] = useState<string | null>(null);

  const changeCadence = async (c: SyncCadence) => {
    setCurrentCadence(c);
    await fetch("/api/admin/kb/sync", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cadence: c }),
    });
  };

  // Poll the run-status endpoint until every triggered run reaches a terminal
  // state, then resolve to the aggregate outcome. Caps at ~5 minutes.
  const pollUntilDone = useCallback(
    async (runIds: number[]): Promise<"success" | "failed"> => {
      const deadline = Date.now() + 5 * 60_000;
      const qs = runIds.join(",");
      // small delay helper without a busy loop
      const wait = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));
      while (Date.now() < deadline) {
        await wait(3000);
        try {
          const res = await fetch(
            `/api/admin/kb/sync/status?runIds=${encodeURIComponent(qs)}`,
          );
          if (!res.ok) continue;
          const data = await res.json();
          if (data.status === "success") return "success";
          if (data.status === "failed") return "failed";
          // else "running" -> keep polling
        } catch {
          // transient; keep polling
        }
      }
      // Timed out waiting; treat as failed so the admin knows to check.
      return "failed";
    },
    [],
  );

  const syncNow = async () => {
    setSyncState("syncing");
    setNotice(null);
    try {
      const res = await fetch("/api/admin/kb/sync", { method: "POST" });
      const data = await res.json();
      if (data.lastSyncAt) setLastSync(data.lastSyncAt);

      // Nothing was triggered (no folders, or Databricks not configured).
      if (!data.runIds || data.runIds.length === 0) {
        setNotice(data.note ?? "There was nothing to sync.");
        setSyncState("idle");
        return;
      }

      const outcome = await pollUntilDone(data.runIds as number[]);
      setSyncState(outcome);
    } catch {
      setSyncState("failed");
    }
  };

  const syncing = syncState === "syncing";

  const addSource = (s: SelectedSource) => {
    setSources((prev) =>
      prev.some((p) => p.id === s.id) ? prev : [s, ...prev],
    );
    setAdding(false);
  };

  const updateSource = (s: SelectedSource) => {
    setSources((prev) => prev.map((p) => (p.id === s.id ? s : p)));
  };

  const removeSource = (id: string) => {
    setSources((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Index sync controls */}
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
            <button
              onClick={syncNow}
              disabled={syncing}
              className="btn-secondary text-sm"
            >
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Syncing…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Sync now
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {syncState === "syncing" && (
        <div className="flex items-center gap-2 rounded-card border border-vivid/40 bg-vivid/10 px-4 py-2 text-xs text-ink">
          <Loader2 className="h-4 w-4 animate-spin text-vivid" />
          Syncing… this can take a minute while the knowledge base updates.
        </div>
      )}

      {syncState === "success" && (
        <div className="flex items-center gap-2 rounded-card border border-success/40 bg-success/10 px-4 py-2 text-xs text-ink">
          <CheckCircle2 className="h-4 w-4 text-success" />
          Sync succeeded.
        </div>
      )}

      {syncState === "failed" && (
        <div className="flex items-center gap-2 rounded-card border border-orange/40 bg-orange/10 px-4 py-2 text-xs text-ink">
          <XCircle className="h-4 w-4 text-orange" />
          Sync failed. Please try again or check the sync job in Databricks.
        </div>
      )}

      {notice && (
        <div className="rounded-card border border-vivid/40 bg-vivid/10 px-4 py-2 text-xs text-ink-muted">
          {notice}
        </div>
      )}

      {/* Selected sources list */}
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">Knowledge sources</h3>
            <p className="text-xs text-ink-muted">
              {sources.length === 0
                ? "No folders selected yet."
                : `${sources.length} SharePoint folder${sources.length === 1 ? "" : "s"} feeding the knowledge base.`}
            </p>
          </div>
          {browseConfigured && !adding && (
            <button
              onClick={() => setAdding(true)}
              className="btn-secondary text-sm"
            >
              <Plus className="h-4 w-4" />
              Add folder
            </button>
          )}
        </div>

        {sources.length > 0 && (
          <ul className="space-y-2">
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                onUpdated={updateSource}
                onRemoved={removeSource}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Add-folder picker */}
      {adding && (
        <SharePointBrowser
          browseConfigured={browseConfigured}
          existing={sources}
          onCancel={sources.length > 0 ? () => setAdding(false) : undefined}
          onSelected={addSource}
        />
      )}
    </div>
  );
}

/** A single selected-source row with an include-subfolders toggle and remove. */
function SourceRow({
  source,
  onUpdated,
  onRemoved,
}: {
  source: SelectedSource;
  onUpdated: (s: SelectedSource) => void;
  onRemoved: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const toggleSubfolders = async (include: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/kb/source/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeSubfolders: include }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdated({
          ...source,
          includeSubfolders: data.source.includeSubfolders,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/admin/kb/source/${source.id}`, {
        method: "DELETE",
      });
      if (res.ok) onRemoved(source.id);
      else setRemoving(false);
    } catch {
      setRemoving(false);
    }
  };

  return (
    <li className="rounded-lg bg-surface-inset p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-ink">
            <FolderOpen className="h-4 w-4 shrink-0 text-orange" />
            <span className="truncate font-medium">{source.folderName}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-subtle">
            {source.siteName} / {source.driveName} / {source.folderPath}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {source.selectedBy ? `set by ${source.selectedBy}` : "added"}
            {` · ${formatDateTime(source.selectedAt)}`}
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={source.includeSubfolders}
              disabled={busy}
              onChange={(e) => toggleSubfolders(e.target.checked)}
              className="h-4 w-4 rounded border-line text-orange focus:ring-orange"
            />
            Include subfolders
            {busy && <Loader2 className="h-3 w-3 animate-spin text-ink-subtle" />}
          </label>
        </div>
        <button
          onClick={remove}
          disabled={removing}
          className="btn-ghost px-2 py-1 text-xs text-orange hover:bg-orange/10"
        >
          {removing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Remove
        </button>
      </div>
    </li>
  );
}

/**
 * Three-step SharePoint folder picker (sites -> libraries -> folders) using the
 * app's own service principal (app-only). On "Use this folder" it POSTs the
 * source, adding it to the knowledge base.
 */
function SharePointBrowser({
  browseConfigured,
  existing,
  onSelected,
  onCancel,
}: {
  browseConfigured: boolean;
  existing: SelectedSource[];
  onSelected: (s: SelectedSource) => void;
  onCancel?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Site step
  const [siteQuery, setSiteQuery] = useState("");
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [site, setSite] = useState<SiteItem | null>(null);

  // Drive step
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [drive, setDrive] = useState<DriveItem | null>(null);

  // Folder step
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [includeSubfolders, setIncludeSubfolders] = useState(true);

  const handleResult = useCallback(
    async (res: Response): Promise<Record<string, unknown> | null> => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (data?.error as string) ||
            "SharePoint request failed. Please try again.",
        );
        return null;
      }
      return data;
    },
    [],
  );

  const loadSites = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/sharepoint/sites?q=${encodeURIComponent(q)}`,
        );
        const data = await handleResult(res);
        if (data) setSites((data.items as SiteItem[]) ?? []);
      } finally {
        setLoading(false);
      }
    },
    [handleResult],
  );

  // Initial site load when the browser mounts and the app is configured.
  useEffect(() => {
    if (browseConfigured) loadSites("");
  }, [browseConfigured, loadSites]);

  const openSite = async (s: SiteItem) => {
    setSite(s);
    setDrive(null);
    setDrives([]);
    setFolders([]);
    setCrumbs([]);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/sharepoint/drives?siteId=${encodeURIComponent(s.id)}`,
      );
      const data = await handleResult(res);
      if (data) setDrives((data.items as DriveItem[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  const loadFolders = useCallback(
    async (driveId: string, itemId: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const qs = itemId
          ? `driveId=${encodeURIComponent(driveId)}&itemId=${encodeURIComponent(itemId)}`
          : `driveId=${encodeURIComponent(driveId)}`;
        const res = await fetch(`/api/admin/sharepoint/children?${qs}`);
        const data = await handleResult(res);
        if (data) setFolders((data.items as FolderItem[]) ?? []);
      } finally {
        setLoading(false);
      }
    },
    [handleResult],
  );

  const openDrive = async (d: DriveItem) => {
    setDrive(d);
    setCrumbs([{ itemId: null, name: d.name }]);
    setFolders([]);
    await loadFolders(d.id, null);
  };

  const drillInto = async (f: FolderItem) => {
    if (!drive) return;
    setCrumbs((c) => [...c, { itemId: f.id, name: f.name }]);
    await loadFolders(drive.id, f.id);
  };

  const jumpToCrumb = async (index: number) => {
    if (!drive) return;
    const target = crumbs[index];
    setCrumbs((c) => c.slice(0, index + 1));
    await loadFolders(drive.id, target.itemId);
  };

  const currentCrumb = crumbs[crumbs.length - 1] ?? null;
  const alreadyAdded = Boolean(
    site &&
      drive &&
      currentCrumb?.itemId &&
      existing.some(
        (e) =>
          e.siteId === site.id &&
          e.driveId === drive.id &&
          e.folderItemId === currentCrumb.itemId,
      ),
  );
  const canUseFolder = Boolean(
    site && drive && currentCrumb && currentCrumb.itemId && !alreadyAdded,
  );

  const useThisFolder = async () => {
    if (!site || !drive || !currentCrumb || !currentCrumb.itemId) return;
    const folderPath = crumbs
      .slice(1)
      .map((c) => c.name)
      .join("/");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/kb/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: site.id,
          siteName: site.name,
          driveId: drive.id,
          driveName: drive.name,
          folderItemId: currentCrumb.itemId,
          folderPath,
          folderName: currentCrumb.name,
          includeSubfolders,
        }),
      });
      if (!res.ok) {
        setError("Could not add the selected folder. Please try again.");
        return;
      }
      const data = await res.json();
      const s = data.source;
      onSelected({
        id: s.id,
        siteId: s.siteId,
        siteName: s.siteName,
        driveId: s.driveId,
        driveName: s.driveName,
        folderItemId: s.folderItemId,
        folderPath: s.folderPath,
        folderName: s.folderName,
        includeSubfolders: s.includeSubfolders,
        selectedBy: s.selectedBy ?? null,
        selectedAt: s.selectedAt,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!browseConfigured) {
    return (
      <div className="card p-4">
        <h3 className="text-sm font-medium text-ink">Add a folder</h3>
        <p className="mt-1 text-xs text-ink-muted">
          SharePoint browsing is not configured. Set SHAREPOINT_TENANT_ID,
          SHAREPOINT_CLIENT_ID, and SHAREPOINT_CLIENT_SECRET to let admins pick a
          folder.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">
          Add a SharePoint folder
        </h3>
        {onCancel && (
          <button onClick={onCancel} className="btn-ghost px-2 py-1 text-xs">
            Cancel
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-orange/10 px-3 py-2 text-xs text-orange">
          {error}
        </p>
      )}

      {/* Step 1: site */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-ink-muted">
          Site
        </label>
        <div className="flex gap-2">
          <input
            className="input text-sm"
            placeholder="Search sites"
            value={siteQuery}
            onChange={(e) => setSiteQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadSites(siteQuery);
            }}
          />
          <button
            onClick={() => loadSites(siteQuery)}
            className="btn-secondary text-sm"
          >
            Search
          </button>
        </div>
        {site ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ink">
            <Check className="h-4 w-4 text-orange" />
            {site.name}
            <button
              onClick={() => {
                setSite(null);
                setDrive(null);
                setDrives([]);
                setFolders([]);
                setCrumbs([]);
              }}
              className="ml-1 text-xs text-ink-subtle hover:text-ink"
            >
              change
            </button>
          </p>
        ) : (
          <ul className="mt-2 max-h-40 divide-y divide-line overflow-y-auto rounded-lg bg-surface-inset">
            {sites.length === 0 && !loading ? (
              <li className="px-3 py-3 text-xs text-ink-subtle">
                No sites found.
              </li>
            ) : (
              sites.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => openSite(s)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-orange/5"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-ink-subtle" />
                    <span className="truncate">{s.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Step 2: library (drive) */}
      {site && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Document library
          </label>
          {drive ? (
            <p className="flex items-center gap-1.5 text-sm text-ink">
              <Check className="h-4 w-4 text-orange" />
              {drive.name}
              <button
                onClick={() => {
                  setDrive(null);
                  setFolders([]);
                  setCrumbs([]);
                }}
                className="ml-1 text-xs text-ink-subtle hover:text-ink"
              >
                change
              </button>
            </p>
          ) : (
            <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg bg-surface-inset">
              {drives.length === 0 && !loading ? (
                <li className="px-3 py-3 text-xs text-ink-subtle">
                  No document libraries found.
                </li>
              ) : (
                drives.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => openDrive(d)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-orange/5"
                    >
                      <Folder className="h-4 w-4 shrink-0 text-ink-subtle" />
                      <span className="truncate">{d.name}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {/* Step 3: folder drill-down */}
      {site && drive && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Folder
          </label>
          <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-ink-muted">
            {crumbs.map((c, i) => (
              <span key={`${c.itemId ?? "root"}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-ink-subtle" />}
                <button
                  onClick={() => jumpToCrumb(i)}
                  className={cn(
                    "rounded px-1 py-0.5 hover:bg-surface-inset",
                    i === crumbs.length - 1 ? "font-medium text-ink" : "text-ink-muted",
                  )}
                >
                  {c.name}
                </button>
              </span>
            ))}
          </div>
          <ul className="max-h-52 divide-y divide-line overflow-y-auto rounded-lg bg-surface-inset">
            {loading ? (
              <li className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-ink-subtle" />
              </li>
            ) : folders.length === 0 ? (
              <li className="px-3 py-3 text-xs text-ink-subtle">
                No subfolders here. You can select the current folder below.
              </li>
            ) : (
              folders.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => drillInto(f)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-orange/5"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-ink-subtle" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-subtle" />
                  </button>
                </li>
              ))
            )}
          </ul>

          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={includeSubfolders}
              onChange={(e) => setIncludeSubfolders(e.target.checked)}
              className="h-4 w-4 rounded border-line text-orange focus:ring-orange"
            />
            Include subfolders
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={useThisFolder}
              disabled={!canUseFolder || saving}
              className="btn-primary text-sm"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Use this folder
            </button>
            {alreadyAdded ? (
              <span className="text-xs text-ink-subtle">
                This folder is already a knowledge source.
              </span>
            ) : (
              !canUseFolder && (
                <span className="text-xs text-ink-subtle">
                  Drill into a folder to select it (the library root cannot be
                  the source).
                </span>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

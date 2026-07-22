"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Folder,
  FolderOpen,
  RefreshCw,
  Loader2,
  ChevronRight,
  Check,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import {
  SYNC_CADENCES,
  SYNC_CADENCE_LABELS,
  type SyncCadence,
} from "@/lib/constants";

interface SelectedSource {
  siteName: string;
  driveName: string;
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
  initialSource,
  cadence,
  lastSyncAt,
  indexConfigured,
  browseConfigured,
}: {
  initialSource: SelectedSource | null;
  cadence: SyncCadence;
  lastSyncAt: string | null;
  indexConfigured: boolean;
  browseConfigured: boolean;
}) {
  const [source, setSource] = useState<SelectedSource | null>(initialSource);
  const [browsing, setBrowsing] = useState(initialSource === null);

  const [currentCadence, setCurrentCadence] = useState(cadence);
  const [lastSync, setLastSync] = useState(lastSyncAt);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      {/* Index sync controls (kept verbatim from the previous KB) */}
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

      {/* Selected-source summary */}
      {source && !browsing ? (
        <div className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-ink">Knowledge source</h3>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
                <FolderOpen className="h-4 w-4 shrink-0 text-orange" />
                <span className="truncate font-medium">
                  {source.folderName}
                </span>
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-subtle">
                {source.siteName} / {source.driveName} / {source.folderPath}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {source.includeSubfolders
                  ? "Including subfolders"
                  : "This folder only"}
                {source.selectedBy ? ` · set by ${source.selectedBy}` : ""}
                {` · ${formatDateTime(source.selectedAt)}`}
              </p>
            </div>
            <button
              onClick={() => setBrowsing(true)}
              className="btn-secondary text-sm"
            >
              Change folder
            </button>
          </div>
        </div>
      ) : (
        <SharePointBrowser
          browseConfigured={browseConfigured}
          onCancel={source ? () => setBrowsing(false) : undefined}
          initialIncludeSubfolders={source?.includeSubfolders ?? true}
          onSelected={(s) => {
            setSource(s);
            setBrowsing(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Three-step SharePoint folder picker (sites -> libraries -> folders) using the
 * app's own service principal (app-only). On "Use this folder" it PUTs the source.
 */
function SharePointBrowser({
  browseConfigured,
  onSelected,
  onCancel,
  initialIncludeSubfolders,
}: {
  browseConfigured: boolean;
  onSelected: (s: SelectedSource) => void;
  onCancel?: () => void;
  initialIncludeSubfolders: boolean;
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
  const [includeSubfolders, setIncludeSubfolders] = useState(
    initialIncludeSubfolders,
  );

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
  const canUseFolder = Boolean(
    site && drive && currentCrumb && currentCrumb.itemId,
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
        method: "PUT",
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
        setError("Could not save the selected folder. Please try again.");
        return;
      }
      const data = await res.json();
      const s = data.source;
      onSelected({
        siteName: s.siteName,
        driveName: s.driveName,
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
        <h3 className="text-sm font-medium text-ink">Knowledge source</h3>
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
          Choose a SharePoint folder
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
            {!canUseFolder && (
              <span className="text-xs text-ink-subtle">
                Drill into a folder to select it (the library root cannot be the
                source).
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

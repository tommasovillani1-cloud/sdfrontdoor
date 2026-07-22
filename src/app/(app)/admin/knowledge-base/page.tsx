import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { SETTINGS_KEYS, type SyncCadence } from "@/lib/constants";
import { isIndexConfigured } from "@/lib/kb/databricks";
import { env } from "@/lib/env";
import { KnowledgeBaseManager } from "@/components/admin/KnowledgeBaseManager";

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage() {
  const [sources, cadence, lastSyncAt] = await Promise.all([
    prisma.kbSource.findMany({ orderBy: { selectedAt: "desc" } }),
    getSetting<SyncCadence>(SETTINGS_KEYS.kbSyncCadence, "daily"),
    getSetting<string | null>(SETTINGS_KEYS.kbLastSyncAt, null),
  ]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">Knowledge base</h2>
        <p className="text-xs text-ink-muted">
          Choose one or more SharePoint folders as the knowledge source. New and
          updated files sync on your chosen cadence; removed files are dropped
          from the index.
        </p>
      </div>

      <KnowledgeBaseManager
        initialSources={sources.map((source) => ({
          id: source.id,
          siteId: source.siteId,
          siteName: source.siteName,
          driveId: source.driveId,
          driveName: source.driveName,
          folderItemId: source.folderItemId,
          folderPath: source.folderPath,
          folderName: source.folderName,
          includeSubfolders: source.includeSubfolders,
          selectedBy: source.selectedBy,
          selectedAt: source.selectedAt.toISOString(),
        }))}
        cadence={cadence}
        lastSyncAt={lastSyncAt}
        indexConfigured={isIndexConfigured()}
        browseConfigured={env.sharepoint.configured}
      />
    </div>
  );
}

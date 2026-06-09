import { prisma } from "@/lib/db";
import { getFolderTree } from "@/lib/kb/folders";
import { getSetting } from "@/lib/settings";
import { SETTINGS_KEYS, type SyncCadence } from "@/lib/constants";
import { isIndexConfigured, isVolumeConfigured } from "@/lib/kb/databricks";
import { KnowledgeBaseManager } from "@/components/admin/KnowledgeBaseManager";

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage() {
  const [tree, cadence, lastSyncAt, categories] = await Promise.all([
    getFolderTree(),
    getSetting<SyncCadence>(SETTINGS_KEYS.kbSyncCadence, "daily"),
    getSetting<string | null>(SETTINGS_KEYS.kbLastSyncAt, null),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">Knowledge base</h2>
        <p className="text-xs text-ink-muted">
          Organise documents into folders that mirror the Unity Catalog Volume.
          Uploaded files keep their original names. Documents are parsed and
          indexed asynchronously, then synced to AI Search on your chosen
          cadence.
        </p>
      </div>

      <KnowledgeBaseManager
        initialTree={tree}
        cadence={cadence}
        lastSyncAt={lastSyncAt}
        indexConfigured={isIndexConfigured()}
        volumeConfigured={isVolumeConfigured()}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}

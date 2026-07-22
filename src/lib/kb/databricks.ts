import { env } from "@/lib/env";

/**
 * Thin Databricks REST client for KB operations: trigger the SharePoint sync
 * Job, and trigger the AI Search index sync. Every method degrades cleanly when
 * Databricks is not configured (returns a no-op result) so the app runs with an
 * empty/unprovisioned KB.
 *
 * The knowledge source is now a SharePoint folder. The daily sync Job (triggered
 * here) authenticates as its own dedicated Entra app, enumerates the folder via
 * Graph delta, and owns all incremental (new/updated/deleted) state and its
 * delta cursor in Databricks. The app only passes the non-secret source
 * descriptor; no client secret ever travels in job parameters.
 */

function host(): string {
  return env.databricks.host.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.databricks.token}` };
}

export function isProcessingJobConfigured(): boolean {
  return Boolean(
    env.databricks.host && env.databricks.token && env.kb.processingJobId,
  );
}

export function isIndexConfigured(): boolean {
  return env.kb.provisioned;
}

/**
 * Trigger the SharePoint sync Job. The Job reads the selected folder, does the
 * Graph delta enumeration (new/updated/deleted), writes chunks to kb_chunks, and
 * persists its own delta cursor. Asynchronous: returns the run id. No-op when
 * unconfigured. The sync Entra credentials live in the Job's Databricks secret
 * scope, NOT in these parameters (job parameters persist in run history).
 */
export async function triggerSharePointSyncJob(source: {
  siteId: string;
  driveId: string;
  folderItemId: string;
  folderPath: string;
  includeSubfolders: boolean;
}): Promise<{ triggered: boolean; runId?: number; error?: string }> {
  if (!isProcessingJobConfigured()) return { triggered: false };

  try {
    const url = `${host()}/api/2.1/jobs/run-now`;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: Number(env.kb.processingJobId),
        job_parameters: {
          source_type: "sharepoint",
          site_id: source.siteId,
          drive_id: source.driveId,
          folder_id: source.folderItemId,
          folder_path: source.folderPath,
          include_subfolders: String(source.includeSubfolders),
          delta_table: env.kb.deltaTable,
          vector_index: env.kb.vectorIndex,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { triggered: false, error: `${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json()) as { run_id?: number };
    return { triggered: true, runId: data.run_id };
  } catch (err) {
    return { triggered: false, error: (err as Error).message };
  }
}

/**
 * Trigger the AI Search Delta Sync Index sync (Triggered mode). No-op when
 * the index is not provisioned.
 */
export async function triggerIndexSync(): Promise<{
  triggered: boolean;
  error?: string;
}> {
  if (!isIndexConfigured()) return { triggered: false };

  try {
    const url = `${host()}/api/2.0/vector-search/indexes/${env.kb.vectorIndex}/sync`;
    const res = await fetch(url, { method: "POST", headers: authHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { triggered: false, error: `${res.status}: ${text.slice(0, 200)}` };
    }
    return { triggered: true };
  } catch (err) {
    return { triggered: false, error: (err as Error).message };
  }
}

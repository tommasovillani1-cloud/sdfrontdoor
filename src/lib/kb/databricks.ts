import { env } from "@/lib/env";

/**
 * Thin Databricks REST client for KB operations: upload a file to a Unity
 * Catalog Volume, trigger the processing Job, and trigger the AI Search index
 * sync. Every method degrades cleanly when Databricks is not configured
 * (returns a no-op result) so the app runs with an empty/unprovisioned KB.
 */

function host(): string {
  return env.databricks.host.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env.databricks.token}` };
}

export function isVolumeConfigured(): boolean {
  return Boolean(env.databricks.host && env.databricks.token && env.kb.volumePath);
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
 * Upload bytes to a Volume path via the Files API (PUT /api/2.0/fs/files).
 * The volumePath must be the full target path including the preserved filename.
 * Returns { uploaded: false } cleanly when not configured.
 */
export async function uploadToVolume(
  volumeFilePath: string,
  bytes: Buffer,
  overwrite = true,
): Promise<{ uploaded: boolean; error?: string }> {
  if (!isVolumeConfigured()) return { uploaded: false };

  try {
    const url = `${host()}/api/2.0/fs/files${encodeURI(volumeFilePath)}?overwrite=${overwrite}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/octet-stream" },
      // Copy into a fresh ArrayBuffer-backed view for an unambiguous BodyInit.
      body: new Blob([Uint8Array.from(bytes)]),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { uploaded: false, error: `${res.status}: ${text.slice(0, 200)}` };
    }
    return { uploaded: true };
  } catch (err) {
    return { uploaded: false, error: (err as Error).message };
  }
}

/** Create a Volume directory (mirrors a KB folder). No-op when unconfigured. */
export async function createVolumeDirectory(
  dirPath: string,
): Promise<{ created: boolean; error?: string }> {
  if (!isVolumeConfigured()) return { created: false };
  try {
    const url = `${host()}/api/2.0/fs/directories${encodeURI(dirPath)}`;
    const res = await fetch(url, { method: "PUT", headers: authHeaders() });
    if (!res.ok && res.status !== 409) {
      const text = await res.text().catch(() => "");
      return { created: false, error: `${res.status}: ${text.slice(0, 200)}` };
    }
    return { created: true };
  } catch (err) {
    return { created: false, error: (err as Error).message };
  }
}

/**
 * Trigger the processing Job (parse/chunk/write to kb_chunks) for an uploaded
 * document. Asynchronous: returns the run id. No-op when unconfigured.
 */
export async function triggerProcessingJob(params: {
  documentId: string;
  volumePath: string;
  originalFilename: string;
  folderPath: string;
  category?: string | null;
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
          document_id: params.documentId,
          volume_path: params.volumePath,
          original_filename: params.originalFilename,
          folder_path: params.folderPath,
          category: params.category ?? "",
          delta_table: env.kb.deltaTable,
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

import { env } from "@/lib/env";

/**
 * Knowledge base retrieval interface.
 *
 * CRITICAL (per brief section 2/6): the app must boot and run with a completely
 * empty or un-provisioned KB. All retrieval lives behind this interface so an
 * empty/unconfigured KB is a clean no-op: it returns [] and never throws,
 * never blocks a chat request, and never errors.
 */

export interface KbChunk {
  /** original filename, shown as the source attribution */
  filename: string;
  folderPath: string;
  content: string;
  score: number;
  category?: string | null;
}

export interface RetrievalQuery {
  query: string;
  topK?: number;
  /** optional filters */
  category?: string | null;
  site?: string | null;
}

export interface KbRetriever {
  isAvailable(): boolean;
  retrieve(q: RetrievalQuery): Promise<KbChunk[]>;
}

/** No-op retriever: used whenever the KB is not provisioned. Always empty. */
class EmptyRetriever implements KbRetriever {
  isAvailable() {
    return false;
  }
  async retrieve(): Promise<KbChunk[]> {
    return [];
  }
}

/**
 * Databricks AI Search retriever. Runs hybrid (semantic + keyword) retrieval
 * against the Delta Sync Index, filtered to active documents. Wrapped so any
 * failure (index missing, endpoint down, auth) degrades to [] rather than
 * breaking chat.
 */
class DatabricksAiSearchRetriever implements KbRetriever {
  isAvailable() {
    return env.kb.provisioned;
  }

  async retrieve(q: RetrievalQuery): Promise<KbChunk[]> {
    if (!this.isAvailable()) return [];

    const topK = q.topK ?? 5;
    try {
      // Databricks Vector Search query API (hybrid).
      const url = `${env.databricks.host.replace(/\/$/, "")}/api/2.0/vector-search/indexes/${env.kb.vectorIndex}/query`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.databricks.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query_text: q.query,
          columns: ["filename", "folder_path", "content", "category"],
          num_results: topK,
          query_type: "HYBRID",
          // Only active documents are indexed/served.
          filters_json: JSON.stringify({ is_active: true }),
        }),
        cache: "no-store",
      });

      if (!res.ok) {
        console.error("KB retrieval non-OK:", res.status);
        return [];
      }

      const data = (await res.json()) as {
        result?: {
          data_array?: unknown[][];
        };
      };
      const rows = data.result?.data_array ?? [];
      // Column order matches the "columns" requested, plus a trailing score.
      return rows.map((row) => ({
        filename: String(row[0] ?? "document"),
        folderPath: String(row[1] ?? ""),
        content: String(row[2] ?? ""),
        category: row[3] != null ? String(row[3]) : null,
        score: typeof row[row.length - 1] === "number" ? (row[row.length - 1] as number) : 0,
      }));
    } catch (err) {
      console.error("KB retrieval error:", (err as Error).message);
      return [];
    }
  }
}

let retriever: KbRetriever | null = null;

export function getRetriever(): KbRetriever {
  if (retriever) return retriever;
  retriever = env.kb.provisioned
    ? new DatabricksAiSearchRetriever()
    : new EmptyRetriever();
  return retriever;
}

/**
 * Build a grounding block from retrieved chunks for injection into the system
 * context, with source attribution by original filename. Returns "" when empty.
 */
export function buildGroundingBlock(chunks: KbChunk[]): string {
  if (!chunks.length) return "";
  const parts = chunks.map((c, i) => {
    return `[${i + 1}] Source: ${c.filename}${c.folderPath ? ` (${c.folderPath})` : ""}\n${c.content.trim()}`;
  });
  return [
    "Knowledge base context (prefer this content and cite the source filename when you use it):",
    ...parts,
  ].join("\n\n");
}

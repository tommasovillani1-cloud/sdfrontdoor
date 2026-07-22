import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { getRunState } from "@/lib/kb/databricks";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/kb/sync/status?runIds=1,2,3
 * Poll the state of the Job runs triggered by "Sync now". Aggregates to a single
 * outcome the UI can act on:
 *   - running:  at least one run still in flight
 *   - success:  all runs finished with SUCCESS
 *   - failed:   all finished and at least one did not succeed
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get("runIds") ?? "";
  const runIds = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (runIds.length === 0) {
    return NextResponse.json({ status: "success", runs: [] });
  }

  const runs = await Promise.all(
    runIds.map(async (runId) => {
      const state = await getRunState(runId);
      return { runId, status: state.status, resultState: state.resultState };
    }),
  );

  const anyRunning = runs.some((r) => r.status === "running");
  const anyFailed = runs.some((r) => r.status === "failed");

  const status = anyRunning ? "running" : anyFailed ? "failed" : "success";

  return NextResponse.json({ status, runs });
}

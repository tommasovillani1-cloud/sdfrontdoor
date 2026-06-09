import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getRetentionMonths } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cron/retention
 *
 * Retention purge (brief sections 9 + 14). Protected by a shared secret so it
 * can be called on a schedule by a Databricks Workflow (the chosen mechanism).
 *
 * Two passes:
 *  1. Soft delete: mark conversations whose started_at is older than the
 *     retention window with deleted_at (if not already set).
 *  2. Hard delete: permanently remove conversations soft-deleted more than a
 *     grace period (7 days) ago. Cascades to messages/escalations/feedback.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  (or ?secret= for simple schedulers)
 */

const HARD_DELETE_GRACE_DAYS = 7;

function authorised(req: NextRequest): boolean {
  if (!env.cronSecret) return false; // refuse if no secret configured
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  const query = req.nextUrl.searchParams.get("secret");
  return bearer === env.cronSecret || query === env.cronSecret;
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const months = await getRetentionMonths();
  const now = new Date();

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);

  // Pass 1: soft delete old, not-yet-deleted conversations.
  const softDeleted = await prisma.conversation.updateMany({
    where: { startedAt: { lt: cutoff }, deletedAt: null },
    data: { deletedAt: now },
  });

  // Pass 2: hard delete those soft-deleted beyond the grace period.
  const hardCutoff = new Date(now);
  hardCutoff.setDate(hardCutoff.getDate() - HARD_DELETE_GRACE_DAYS);

  const hardDeleted = await prisma.conversation.deleteMany({
    where: { deletedAt: { not: null, lt: hardCutoff } },
  });

  return NextResponse.json({
    ok: true,
    retentionMonths: months,
    cutoff: cutoff.toISOString(),
    softDeleted: softDeleted.count,
    hardDeleted: hardDeleted.count,
  });
}

/** GET returns config so a scheduler health check can confirm wiring. */
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const months = await getRetentionMonths();
  return NextResponse.json({ ok: true, retentionMonths: months });
}

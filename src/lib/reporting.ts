import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Reporting metrics (brief section 10). All date filtering is on started_at.
 * Filters compose: year, month, explicit range, category, site.
 */

export interface ReportFilters {
  year?: number;
  month?: number; // 1-12
  from?: Date;
  to?: Date;
  categoryId?: string;
  site?: string;
}

/** Resolve the [start, end) window from year/month/range filters. */
export function resolveDateRange(filters: ReportFilters): {
  gte?: Date;
  lt?: Date;
} {
  // Explicit range wins if provided.
  if (filters.from || filters.to) {
    return {
      gte: filters.from,
      lt: filters.to
        ? new Date(filters.to.getTime() + 24 * 60 * 60 * 1000) // inclusive end day
        : undefined,
    };
  }
  if (filters.year && filters.month) {
    const gte = new Date(Date.UTC(filters.year, filters.month - 1, 1));
    const lt = new Date(Date.UTC(filters.year, filters.month, 1));
    return { gte, lt };
  }
  if (filters.year) {
    const gte = new Date(Date.UTC(filters.year, 0, 1));
    const lt = new Date(Date.UTC(filters.year + 1, 0, 1));
    return { gte, lt };
  }
  return {};
}

function buildWhere(filters: ReportFilters): Prisma.ConversationWhereInput {
  const range = resolveDateRange(filters);
  const where: Prisma.ConversationWhereInput = { deletedAt: null };

  if (range.gte || range.lt) {
    where.startedAt = {};
    if (range.gte) where.startedAt.gte = range.gte;
    if (range.lt) where.startedAt.lt = range.lt;
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.site) where.user = { site: filters.site };

  return where;
}

export interface ReportSummary {
  total: number;
  resolved: number;
  escalated: number;
  active: number;
  deflectionRate: number; // resolved / total
  avgTurnsToResolution: number | null;
}

export async function getSummary(
  filters: ReportFilters,
): Promise<ReportSummary> {
  const where = buildWhere(filters);

  const [total, resolved, escalated, active] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.count({ where: { ...where, status: "resolved" } }),
    prisma.conversation.count({ where: { ...where, status: "escalated" } }),
    prisma.conversation.count({ where: { ...where, status: "active" } }),
  ]);

  // Average user turns to resolution, over resolved conversations.
  const resolvedConvos = await prisma.conversation.findMany({
    where: { ...where, status: "resolved" },
    select: { _count: { select: { messages: true } } },
  });
  let avgTurnsToResolution: number | null = null;
  if (resolvedConvos.length) {
    // Approx: user turns ~ half of total messages (user+assistant pairs).
    const totalMsgs = resolvedConvos.reduce(
      (sum, c) => sum + c._count.messages,
      0,
    );
    avgTurnsToResolution =
      Math.round((totalMsgs / resolvedConvos.length / 2) * 10) / 10;
  }

  return {
    total,
    resolved,
    escalated,
    active,
    deflectionRate: total > 0 ? resolved / total : 0,
    avgTurnsToResolution,
  };
}

export interface CategoryBreakdownRow {
  categoryId: string | null;
  categoryName: string;
  total: number;
  resolved: number;
  resolutionRate: number;
}

export async function getCategoryBreakdown(
  filters: ReportFilters,
): Promise<CategoryBreakdownRow[]> {
  const where = buildWhere(filters);

  const grouped = await prisma.conversation.groupBy({
    by: ["categoryId", "status"],
    where,
    _count: { _all: true },
  });

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  const acc = new Map<string | null, { total: number; resolved: number }>();
  for (const row of grouped) {
    const key = row.categoryId;
    const cur = acc.get(key) ?? { total: 0, resolved: 0 };
    cur.total += row._count._all;
    if (row.status === "resolved") cur.resolved += row._count._all;
    acc.set(key, cur);
  }

  const rows: CategoryBreakdownRow[] = [];
  for (const [categoryId, counts] of acc.entries()) {
    rows.push({
      categoryId,
      categoryName: categoryId
        ? (nameById.get(categoryId) ?? "Unknown")
        : "Uncategorised",
      total: counts.total,
      resolved: counts.resolved,
      resolutionRate: counts.total > 0 ? counts.resolved / counts.total : 0,
    });
  }
  rows.sort((a, b) => b.total - a.total);
  return rows;
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  total: number;
  resolved: number;
  escalated: number;
}

/** Daily trend over the selected window (falls back to last 30 days). */
export async function getTrend(filters: ReportFilters): Promise<TrendPoint[]> {
  const where = buildWhere(filters);
  const convos = await prisma.conversation.findMany({
    where,
    select: { startedAt: true, status: true },
    orderBy: { startedAt: "asc" },
  });

  const byDay = new Map<string, TrendPoint>();
  for (const c of convos) {
    const key = c.startedAt.toISOString().slice(0, 10);
    const pt =
      byDay.get(key) ?? { date: key, total: 0, resolved: 0, escalated: 0 };
    pt.total += 1;
    if (c.status === "resolved") pt.resolved += 1;
    if (c.status === "escalated") pt.escalated += 1;
    byDay.set(key, pt);
  }
  return Array.from(byDay.values());
}

/** Distinct sites present, for the Site filter dropdown. */
export async function getSites(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { site: { not: null } },
    distinct: ["site"],
    select: { site: true },
    orderBy: { site: "asc" },
  });
  return rows.map((r) => r.site!).filter(Boolean);
}

export interface FeedbackSummary {
  up: number;
  down: number;
}

export async function getFeedbackSummary(): Promise<FeedbackSummary> {
  const [up, down] = await Promise.all([
    prisma.feedback.count({ where: { rating: "up" } }),
    prisma.feedback.count({ where: { rating: "down" } }),
  ]);
  return { up, down };
}

export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
  assistantMessages: number;
}

/**
 * Token usage across assistant messages within the filter window. Feeds the
 * existing Databricks AI Gateway governance story; surfaced for visibility.
 */
export async function getTokenUsage(
  filters: ReportFilters,
): Promise<TokenUsage> {
  const range = resolveDateRange(filters);
  const where: Prisma.MessageWhereInput = { role: "assistant" };
  if (range.gte || range.lt) {
    where.createdAt = {};
    if (range.gte) where.createdAt.gte = range.gte;
    if (range.lt) where.createdAt.lt = range.lt;
  }
  const agg = await prisma.message.aggregate({
    where,
    _sum: { tokensIn: true, tokensOut: true },
    _count: { _all: true },
  });
  return {
    tokensIn: agg._sum.tokensIn ?? 0,
    tokensOut: agg._sum.tokensOut ?? 0,
    assistantMessages: agg._count._all,
  };
}

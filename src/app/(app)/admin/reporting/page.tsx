import { prisma } from "@/lib/db";
import {
  getSummary,
  getCategoryBreakdown,
  getTrend,
  getSites,
  getTokenUsage,
  type ReportFilters,
} from "@/lib/reporting";
import { MetricCard } from "@/components/admin/MetricCard";
import { ReportFiltersBar } from "@/components/admin/ReportFilters";
import { TrendChart } from "@/components/admin/TrendChart";
import { RecentConversations } from "@/components/admin/RecentConversations";

export const dynamic = "force-dynamic";

function parseFilters(sp: Record<string, string | undefined>): ReportFilters {
  const f: ReportFilters = {};
  if (sp.year) f.year = Number(sp.year);
  if (sp.month) f.month = Number(sp.month);
  if (sp.from) f.from = new Date(sp.from);
  if (sp.to) f.to = new Date(sp.to);
  if (sp.categoryId) f.categoryId = sp.categoryId;
  if (sp.site) f.site = sp.site;
  return f;
}

export default async function ReportingPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const filters = parseFilters(searchParams);

  const [summary, breakdown, trend, sites, categories, tokens] =
    await Promise.all([
      getSummary(filters),
      getCategoryBreakdown(filters),
      getTrend(filters),
      getSites(),
      prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
      getTokenUsage(filters),
    ]);

  const deflectionPct = Math.round(summary.deflectionRate * 100);

  // Recent conversations within the filter window for recategorisation.
  const recent = await prisma.conversation.findMany({
    where: {
      deletedAt: null,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: 25,
    select: {
      id: true,
      title: true,
      status: true,
      startedAt: true,
      categoryId: true,
    },
  });

  return (
    <div className="space-y-6">
      <ReportFiltersBar
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
        sites={sites}
      />

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Deflection rate"
          value={`${deflectionPct}%`}
          sub="resolved / total"
          accent="vibrant"
        />
        <MetricCard label="Total" value={summary.total} />
        <MetricCard label="Resolved" value={summary.resolved} accent="vibrant" />
        <MetricCard label="Escalated" value={summary.escalated} accent="orange" />
        <MetricCard
          label="Avg turns to resolve"
          value={summary.avgTurnsToResolution ?? "—"}
          accent="brilliant"
        />
      </div>

      {/* Trend */}
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Trend over selected period
        </h2>
        <TrendChart data={trend} />
      </div>

      {/* Token usage (feeds AI Gateway governance) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard
          label="Tokens in"
          value={tokens.tokensIn.toLocaleString("en-GB")}
          sub="prompt tokens"
          accent="violet"
        />
        <MetricCard
          label="Tokens out"
          value={tokens.tokensOut.toLocaleString("en-GB")}
          sub="completion tokens"
          accent="violet"
        />
        <MetricCard
          label="Assistant messages"
          value={tokens.assistantMessages.toLocaleString("en-GB")}
          sub="in period"
        />
      </div>

      {/* By category */}
      <div className="card overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          By category
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-inset text-left text-xs uppercase tracking-wide text-ink-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Total</th>
                <th className="px-4 py-2 font-medium">Resolved</th>
                <th className="px-4 py-2 font-medium">Resolution rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {breakdown.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-subtle">
                    No conversations for the selected filters.
                  </td>
                </tr>
              ) : (
                breakdown.map((row) => (
                  <tr key={row.categoryId ?? "none"} className="hover:bg-surface-muted">
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {row.categoryName}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{row.total}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{row.resolved}</td>
                    <td className="px-4 py-2.5 text-ink-muted">
                      {Math.round(row.resolutionRate * 100)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent conversations + recategorise */}
      <div className="card overflow-hidden">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Recent conversations
        </h2>
        <RecentConversations
          conversations={recent.map((c) => ({
            id: c.id,
            title: c.title,
            status: c.status,
            startedAt: c.startedAt.toISOString(),
            categoryId: c.categoryId,
          }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    </div>
  );
}

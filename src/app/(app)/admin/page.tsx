import Link from "next/link";
import { Users, BarChart3, BookOpen, Plug } from "lucide-react";
import { getSummary, getFeedbackSummary } from "@/lib/reporting";
import { prisma } from "@/lib/db";
import { MetricCard } from "@/components/admin/MetricCard";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const [summary, feedback, userCount, kbDocs] = await Promise.all([
    getSummary({}),
    getFeedbackSummary(),
    prisma.user.count(),
    prisma.kbDocument.count(),
  ]);

  const deflectionPct = Math.round(summary.deflectionRate * 100);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">All time at a glance</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            label="Deflection rate"
            value={`${deflectionPct}%`}
            sub={`${summary.resolved} of ${summary.total} resolved`}
            accent="vibrant"
          />
          <MetricCard label="Total interactions" value={summary.total} />
          <MetricCard label="Emailed Service Desk" value={summary.escalated} accent="orange" />
          <MetricCard
            label="Feedback"
            value={`${feedback.up} / ${feedback.down}`}
            sub="up / down"
            accent="brilliant"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Quick links</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickLink href="/admin/users" icon={<Users className="h-5 w-5" />} label="Users" sub={`${userCount} known`} />
          <QuickLink href="/admin/reporting" icon={<BarChart3 className="h-5 w-5" />} label="Reporting" sub="Filters and trends" />
          <QuickLink href="/admin/knowledge-base" icon={<BookOpen className="h-5 w-5" />} label="Knowledge base" sub={`${kbDocs} documents`} />
          <QuickLink href="/admin/servicenow" icon={<Plug className="h-5 w-5" />} label="ServiceNow" sub="Integration settings" />
        </div>
      </section>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className="card flex items-center gap-3 p-4 transition-colors hover:border-orange/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange/10 text-orange">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-muted">{sub}</span>
      </span>
    </Link>
  );
}

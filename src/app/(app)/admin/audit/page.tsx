import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { email: true, displayName: true } } },
  });

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">Audit log</h2>
        <p className="text-xs text-ink-muted">
          A record of administrative actions. Most recent 200 shown.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-inset text-left text-xs uppercase tracking-wide text-ink-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-subtle">
                    No audit entries yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-muted">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">
                      {log.actor?.email ?? "system"}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink">
                      {log.action}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2.5 text-ink-muted">
                      {log.target ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

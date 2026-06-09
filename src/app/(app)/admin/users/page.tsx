import { prisma } from "@/lib/db";
import { UsersTable } from "@/components/admin/UsersTable";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ isAdmin: "desc" }, { lastSeenAt: "desc" }],
  });

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">User management</h2>
        <p className="text-xs text-ink-muted">
          Toggle administrator access and erase a user&apos;s conversations
          (GDPR). The last administrator cannot be removed.
        </p>
      </div>
      <UsersTable
        initialUsers={users.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          site: u.site,
          isAdmin: u.isAdmin,
          lastSeenAt: u.lastSeenAt.toISOString(),
        }))}
      />
    </div>
  );
}

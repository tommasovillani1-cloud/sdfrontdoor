import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveCurrentUser } from "@/lib/identity";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await resolveCurrentUser();
  if (!user || !user.isAdmin) {
    redirect("/");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-surface px-4 py-3 lg:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-ink">Administration</h1>
              <p className="text-xs text-ink-muted">
                Manage users, reporting, the knowledge base, and integrations.
              </p>
            </div>
            <Link href="/" className="btn-secondary text-sm">
              Back to chat
            </Link>
          </div>
          <AdminNav />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">{children}</div>
      </div>
    </div>
  );
}

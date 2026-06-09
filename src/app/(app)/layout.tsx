import Link from "next/link";
import { resolveCurrentUser } from "@/lib/identity";
import { Logo } from "@/components/Logo";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await resolveCurrentUser();

  // No forwarded identity (only possible locally with a blank dev override).
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <Logo variant="light" className="mx-auto mb-6 h-10" />
          <h1 className="mb-2 text-lg font-semibold text-ink">
            No signed-in user detected
          </h1>
          <p className="text-sm text-ink-muted">
            This app expects a Databricks-forwarded identity. For local
            development, set <code className="rounded bg-surface-inset px-1">DEV_FORWARDED_EMAIL</code>{" "}
            in your <code className="rounded bg-surface-inset px-1">.env</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      <Sidebar isAdmin={user.isAdmin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 pl-14 md:pl-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo variant="light" className="h-7" />
            <span className="hidden text-sm font-medium text-ink-muted sm:inline">
              Service Desk
            </span>
          </Link>
          <UserMenu
            name={user.displayName ?? user.email}
            email={user.email}
            site={user.site ?? "Unknown"}
            isAdmin={user.isAdmin}
          />
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  MessageSquare,
  ShieldCheck,
  Trash2,
  Loader2,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

interface ConversationListItem {
  id: string;
  title: string;
  status: string;
  startedAt: string;
}

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("c");

  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/conversations${q ? `?search=${encodeURIComponent(q)}` : ""}`,
      );
      if (res.ok) {
        const data = await res.json();
        setItems(data.conversations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  // Reload the list when navigating (e.g. after a new conversation is created).
  useEffect(() => {
    if (pathname === "/") load(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, pathname]);

  const onDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (activeId === id) router.push("/");
    }
  };

  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop: persistent sidebar */}
      <SidebarBody
        isAdmin={isAdmin}
        items={items}
        loading={loading}
        search={search}
        setSearch={setSearch}
        activeId={activeId}
        pathname={pathname}
        onDelete={onDelete}
        className="hidden w-72 shrink-0 md:flex"
      />

      {/* Mobile: hamburger trigger (fixed, top-left) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink shadow-sm md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile: slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full w-72 max-w-[85%] animate-fade-in shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3 z-50 flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarBody
              isAdmin={isAdmin}
              items={items}
              loading={loading}
              search={search}
              setSearch={setSearch}
              activeId={activeId}
              pathname={pathname}
              onDelete={onDelete}
              onNavigate={() => setMobileOpen(false)}
              className="flex h-full w-full"
            />
          </div>
        </div>
      )}
    </>
  );
}

function SidebarBody({
  isAdmin,
  items,
  loading,
  search,
  setSearch,
  activeId,
  pathname,
  onDelete,
  className,
  onNavigate,
}: {
  isAdmin: boolean;
  items: ConversationListItem[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  activeId: string | null;
  pathname: string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <aside className={cn("flex-col bg-eternal text-white", className)}>
      <div className="flex h-14 items-center border-b border-white/10 px-4">
        <Logo variant="dark" className="h-8 rounded" />
      </div>

      <div className="p-3">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange px-3 py-2 text-sm font-medium text-orange-fg transition-colors hover:bg-orange/90"
        >
          <Plus className="h-4 w-4" />
          New conversation
        </Link>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history"
            aria-label="Search conversation history"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-sm text-white placeholder:text-white/40 focus:border-brilliant focus:outline-none focus:ring-1 focus:ring-brilliant"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-white/40">
            {search ? "No matches." : "No conversations yet."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/?c=${item.id}`}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    activeId === item.id
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.status === "resolved" && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-vibrant" title="Resolved" />
                  )}
                  {item.status === "escalated" && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange" title="Escalated" />
                  )}
                  <button
                    onClick={(e) => onDelete(item.id, e)}
                    className="opacity-0 transition-opacity hover:text-orange group-hover:opacity-100"
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {isAdmin && (
        <div className="border-t border-white/10 p-3">
          <Link
            href="/admin"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname.startsWith("/admin")
                ? "bg-white/15 text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Admin
          </Link>
        </div>
      )}
    </aside>
  );
}

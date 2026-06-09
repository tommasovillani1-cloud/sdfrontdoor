"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Compact user identity chip in the header. Read-only (no sign-out: identity
 *  is managed by Databricks at the platform level). */
export function UserMenu({
  name,
  email,
  site,
  isAdmin,
}: {
  name: string;
  email: string;
  site: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-sm transition-colors hover:bg-surface-inset"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-eternal text-xs font-semibold text-white">
          {initials || "U"}
        </span>
        <span className="hidden max-w-[12rem] truncate font-medium text-ink sm:inline">
          {name}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 animate-fade-in rounded-card border border-line bg-surface p-3 shadow-lg">
          <p className="truncate font-medium text-ink">{name}</p>
          <p className="truncate text-xs text-ink-muted">{email}</p>
          <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-ink-muted">
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {site}
            </p>
            {isAdmin && (
              <p className={cn("flex items-center gap-1.5 text-orange")}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Administrator
              </p>
            )}
          </div>
          <p className="mt-3 border-t border-line pt-3 text-[11px] leading-snug text-ink-subtle">
            You are signed in via Databricks. Sign-in is managed by the
            platform.
          </p>
        </div>
      )}
    </div>
  );
}

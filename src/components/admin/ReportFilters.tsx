"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

interface Option {
  value: string;
  label: string;
}

export function ReportFiltersBar({
  categories,
  sites,
}: {
  categories: Option[];
  sites: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const now = new Date();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.push(`/admin/reporting?${next.toString()}`);
    },
    [params, router],
  );

  const clear = () => router.push("/admin/reporting");

  return (
    <div className="card mb-5 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Year">
          <select
            className="input"
            value={params.get("year") ?? ""}
            onChange={(e) => update("year", e.target.value)}
          >
            <option value="">All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Month">
          <select
            className="input"
            value={params.get("month") ?? ""}
            onChange={(e) => update("month", e.target.value)}
          >
            <option value="">All</option>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <Field label="From">
          <input
            type="date"
            className="input"
            value={params.get("from") ?? ""}
            onChange={(e) => update("from", e.target.value)}
          />
        </Field>

        <Field label="To">
          <input
            type="date"
            className="input"
            value={params.get("to") ?? ""}
            onChange={(e) => update("to", e.target.value)}
          />
        </Field>

        <Field label="Category">
          <select
            className="input"
            value={params.get("categoryId") ?? ""}
            onChange={(e) => update("categoryId", e.target.value)}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Site">
          <select
            className="input"
            value={params.get("site") ?? ""}
            onChange={(e) => update("site", e.target.value)}
          >
            <option value="">All</option>
            {sites.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={clear} className="btn-ghost text-xs">
          Clear filters
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

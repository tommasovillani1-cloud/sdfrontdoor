import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "orange" | "vibrant" | "brilliant" | "violet";
}) {
  const accentClass = {
    orange: "text-orange",
    vibrant: "text-[rgb(90,140,30)]",
    brilliant: "text-info",
    violet: "text-violet",
  }[accent ?? "orange"];

  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold", accent ? accentClass : "text-ink")}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

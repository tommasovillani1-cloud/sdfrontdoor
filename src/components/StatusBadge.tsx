import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  active: "bg-info/10 text-info",
  resolved: "bg-success/15 text-[rgb(90,140,30)]",
  escalated: "bg-orange/10 text-orange",
};

const LABELS: Record<string, string> = {
  active: "Active",
  resolved: "Resolved",
  escalated: "Emailed Service Desk",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("badge", STYLES[status] ?? "bg-surface-inset text-ink-muted")}>
      {LABELS[status] ?? status}
    </span>
  );
}

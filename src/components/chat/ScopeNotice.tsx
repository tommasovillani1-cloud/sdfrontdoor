import { Info } from "lucide-react";

/** Shown when no AI provider is configured, so the demo is honest about why
 *  replies are limited. */
export function ScopeNotice() {
  return (
    <div className="mt-6 flex items-start gap-2 rounded-card border border-vivid/40 bg-vivid/10 px-4 py-3 text-left text-xs text-ink-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(170,130,0)]" />
      <span>
        The AI assistant is not configured in this environment yet. You can still
        explore the interface, and escalation to the Service Desk works. Set{" "}
        <code className="rounded bg-surface-inset px-1">AI_BASE_URL</code> and{" "}
        <code className="rounded bg-surface-inset px-1">AI_API_KEY</code> to
        enable live replies.
      </span>
    </div>
  );
}

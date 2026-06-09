"use client";

import { Check, X } from "lucide-react";

/** The structured "Did this resolve your issue?" prompt, shown when the model
 *  emits propose_resolution_check. */
export function ResolutionCheck({
  summary,
  onAnswer,
}: {
  summary: string;
  onAnswer: (resolved: boolean) => void;
}) {
  return (
    <div className="mx-auto max-w-md animate-fade-in rounded-card border border-brilliant/30 bg-brilliant/5 p-4 text-center">
      <p className="text-sm font-medium text-ink">Did this resolve your issue?</p>
      {summary && <p className="mt-1 text-xs text-ink-muted">{summary}</p>}
      <div className="mt-3 flex justify-center gap-2">
        <button
          onClick={() => onAnswer(true)}
          className="btn bg-vibrant px-4 py-2 text-sm font-medium text-white hover:bg-vibrant/90"
        >
          <Check className="h-4 w-4" />
          Yes, thanks
        </button>
        <button
          onClick={() => onAnswer(false)}
          className="btn-secondary px-4 py-2 text-sm"
        >
          <X className="h-4 w-4" />
          No, I still need help
        </button>
      </div>
    </div>
  );
}

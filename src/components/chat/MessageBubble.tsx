"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, User, Bot, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Render a message. Assistant messages get thumbs feedback once persisted
 *  (i.e. when the id is a real DB id, not a temp/streaming one). */
export function MessageBubble({
  id,
  role,
  content,
  streaming,
}: {
  id: string;
  role: string;
  content: string;
  streaming?: boolean;
}) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [busy, setBusy] = useState(false);

  const isUser = role === "user";
  const isSystem = role === "system";
  const canRate = role === "assistant" && !streaming && !id.startsWith("tmp-");

  const rate = async (value: "up" | "down") => {
    if (busy) return;
    setBusy(true);
    const next = rating === value ? null : value;
    setRating(next);
    try {
      if (next) {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: id, rating: next }),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  if (isSystem) {
    return (
      <div className="flex items-center justify-center">
        <p className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs text-[rgb(80,120,30)]">
          <Info className="h-3.5 w-3.5" />
          {content}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-eternal text-white" : "bg-orange/10 text-orange",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </span>

      <div className={cn("min-w-0 max-w-[85%]", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-card px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-eternal text-white"
              : "border border-line bg-surface text-ink",
          )}
        >
          {content ? (
            <div className="whitespace-pre-wrap break-words">{content}</div>
          ) : streaming ? (
            <div className="flex gap-1 py-1" aria-label="Assistant is typing">
              <span className="h-2 w-2 animate-pulse-soft rounded-full bg-cool" />
              <span
                className="h-2 w-2 animate-pulse-soft rounded-full bg-cool"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="h-2 w-2 animate-pulse-soft rounded-full bg-cool"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
          ) : null}
        </div>

        {canRate && (
          <div className="mt-1 flex gap-1">
            <button
              onClick={() => rate("up")}
              className={cn(
                "rounded p-1 text-ink-subtle transition-colors hover:text-vibrant",
                rating === "up" && "text-vibrant",
              )}
              aria-label="Helpful"
              aria-pressed={rating === "up"}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => rate("down")}
              className={cn(
                "rounded p-1 text-ink-subtle transition-colors hover:text-orange",
                rating === "down" && "text-orange",
              )}
              aria-label="Not helpful"
              aria-pressed={rating === "down"}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

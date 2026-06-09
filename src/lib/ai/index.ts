import { env } from "@/lib/env";
import type { AiAdapter, StreamChatParams, StreamEvent } from "./types";
import { OpenAICompatibleAdapter } from "./openai-compatible";

export * from "./types";

/**
 * Fallback adapter used when no AI provider is configured (no AI_BASE_URL /
 * AI_API_KEY). Keeps the app fully functional for local UI work and ensures
 * chat never hard-crashes: it returns a clear, polite message pointing at the
 * Service Desk handoff instead of throwing.
 */
class UnconfiguredAdapter implements AiAdapter {
  private readonly message =
    "The AI assistant is not configured in this environment yet, so I cannot generate a live answer. You can still raise your IT issue with the Service Desk using the escalation button, and an analyst will help you.";

  async *streamChat(): AsyncGenerator<StreamEvent> {
    yield { type: "text", delta: this.message };
    yield {
      type: "done",
      usage: { tokensIn: null, tokensOut: null },
      model: "unconfigured",
      finishReason: "stop",
    };
  }

  async complete() {
    return {
      text: this.message,
      toolCalls: [],
      usage: { tokensIn: null, tokensOut: null },
      model: "unconfigured",
    };
  }
}

let adapter: AiAdapter | null = null;

/** Resolve the configured adapter (memoised). */
export function getAiAdapter(): AiAdapter {
  if (adapter) return adapter;

  if (!env.ai.configured) {
    adapter = new UnconfiguredAdapter();
    return adapter;
  }

  // Both "databricks" and "openai-compatible" use the OpenAI-compatible client.
  // "anthropic" can also be reached through an OpenAI-compatible gateway; a
  // dedicated Anthropic-native adapter can be slotted in here later if needed.
  switch (env.ai.provider) {
    case "databricks":
    case "openai-compatible":
    case "anthropic":
    default:
      adapter = new OpenAICompatibleAdapter();
      return adapter;
  }
}

export function isAiConfigured(): boolean {
  return env.ai.configured;
}

export type { StreamChatParams };

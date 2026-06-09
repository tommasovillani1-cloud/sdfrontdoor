import OpenAI from "openai";
import { env } from "@/lib/env";
import type {
  AiAdapter,
  ChatMessage,
  StreamChatParams,
  StreamEvent,
  ToolCall,
  ToolDefinition,
} from "./types";

/**
 * Adapter for any OpenAI-compatible Chat Completions API. This covers:
 *  - Databricks serving endpoints (Claude Sonnet 4.6 served OpenAI-compatible)
 *  - Anthropic via an OpenAI-compatible gateway
 *  - any other OpenAI-compatible endpoint
 *
 * Provider selection and model are driven entirely by .env.
 */
export class OpenAICompatibleAdapter implements AiAdapter {
  private client: OpenAI;
  private defaultModel: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.ai.apiKey || "not-configured",
      baseURL: env.ai.baseUrl || undefined,
    });
    this.defaultModel = env.ai.model;
  }

  private toOpenAiMessages(
    messages: ChatMessage[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          content: m.content,
          tool_call_id: m.toolCallId ?? "",
        };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((t) => ({
            id: t.id,
            type: "function" as const,
            function: { name: t.name, arguments: t.arguments },
          })),
        };
      }
      return { role: m.role, content: m.content } as
        | OpenAI.Chat.ChatCompletionSystemMessageParam
        | OpenAI.Chat.ChatCompletionUserMessageParam
        | OpenAI.Chat.ChatCompletionAssistantMessageParam;
    });
  }

  private toOpenAiTools(
    tools?: ToolDefinition[],
  ): OpenAI.Chat.ChatCompletionTool[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async *streamChat(params: StreamChatParams): AsyncGenerator<StreamEvent> {
    const model = params.model || this.defaultModel;
    const stream = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAiMessages(params.messages),
      tools: this.toOpenAiTools(params.tools),
      max_tokens: params.maxTokens ?? env.ai.maxTokens,
      temperature: params.temperature ?? env.ai.temperature,
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: params.signal });

    // Accumulate tool-call fragments across deltas (OpenAI streams them piecewise).
    const toolAcc = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let usageIn: number | null = null;
    let usageOut: number | null = null;
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) {
        yield { type: "text", delta: choice.delta.content };
      }
      const deltaToolCalls = choice?.delta?.tool_calls;
      if (deltaToolCalls) {
        for (const tc of deltaToolCalls) {
          const idx = tc.index ?? 0;
          const cur = toolAcc.get(idx) ?? { id: "", name: "", arguments: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
          toolAcc.set(idx, cur);
        }
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) {
        usageIn = chunk.usage.prompt_tokens ?? null;
        usageOut = chunk.usage.completion_tokens ?? null;
      }
    }

    // Emit any completed tool calls.
    for (const tc of toolAcc.values()) {
      if (tc.name) {
        yield {
          type: "tool_call",
          toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments || "{}" },
        };
      }
    }

    yield {
      type: "done",
      usage: { tokensIn: usageIn, tokensOut: usageOut },
      model,
      finishReason,
    };
  }

  async complete(params: StreamChatParams) {
    const model = params.model || this.defaultModel;
    const res = await this.client.chat.completions.create({
      model,
      messages: this.toOpenAiMessages(params.messages),
      tools: this.toOpenAiTools(params.tools),
      max_tokens: params.maxTokens ?? env.ai.maxTokens,
      temperature: params.temperature ?? env.ai.temperature,
      stream: false,
    }, { signal: params.signal });

    const choice = res.choices?.[0];
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map(
      (t) => ({
        id: t.id,
        name: t.function.name,
        arguments: t.function.arguments,
      }),
    );

    return {
      text: choice?.message?.content ?? "",
      toolCalls,
      usage: {
        tokensIn: res.usage?.prompt_tokens ?? null,
        tokensOut: res.usage?.completion_tokens ?? null,
      },
      model,
    };
  }
}

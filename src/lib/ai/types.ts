/** Provider-abstracted chat types. The interface stays generic so the model
 *  or provider can be swapped via .env without touching call sites. */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image_url";
  image_url: { url: string }; // data:image/...;base64,...
}

export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: ChatRole;
  /** Plain string for text-only messages; array for multipart (vision). */
  content: string | ContentPart[];
  /** present on tool messages: the tool_call_id being answered */
  toolCallId?: string;
  /** present on assistant messages that requested tool calls */
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  /** raw JSON arguments string as emitted by the model */
  arguments: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters */
  parameters: Record<string, unknown>;
}

export interface StreamChatParams {
  messages: ChatMessage[];
  model?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/** Streamed events from the adapter. */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | {
      type: "done";
      usage: { tokensIn: number | null; tokensOut: number | null };
      model: string;
      finishReason: string | null;
    };

export interface AiAdapter {
  /** Stream a chat completion as async events. */
  streamChat(params: StreamChatParams): AsyncGenerator<StreamEvent>;
  /** Non-streaming completion, used for server-side classification etc. */
  complete(params: StreamChatParams): Promise<{
    text: string;
    toolCalls: ToolCall[];
    usage: { tokensIn: number | null; tokensOut: number | null };
    model: string;
  }>;
}

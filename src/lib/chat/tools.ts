import type { ToolDefinition } from "@/lib/ai/types";

/**
 * Structured resolution signal (brief section 6). The model calls this tool
 * when it judges the issue is likely resolved, instead of us parsing free text.
 * The app then renders the "Did this resolve your issue?" Yes/No prompt.
 */
export const PROPOSE_RESOLUTION_CHECK: ToolDefinition = {
  name: "propose_resolution_check",
  description:
    "Call this when you believe the user's IT issue is likely resolved, to ask them to confirm. Do not announce resolution in text; emit this tool instead so the app can show a confirmation prompt.",
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description:
          "A one sentence summary of what was resolved, in British English, no em dashes.",
      },
    },
    required: ["summary"],
    additionalProperties: false,
  },
};

export const CHAT_TOOLS: ToolDefinition[] = [PROPOSE_RESOLUTION_CHECK];

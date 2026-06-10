import { getAiAdapter } from "@/lib/ai";
import type { ChatMessage } from "@/lib/ai/types";

/**
 * Build the escalation email summary (brief section 8). The assistant produces
 * a concise SUMMARY, not a transcript: the issue, what was tried, what is
 * outstanding. mailto: links have a practical ceiling (~1800-2000 chars), so we
 * cap aggressively.
 */

const MAILTO_MAX = 1800;

export interface EscalationSummary {
  subject: string;
  body: string;
}

function fallbackSummary(
  userName: string,
  messages: { role: string; content: string }[],
): EscalationSummary {
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  const subject = "IT Service Desk request: assistance needed";
  const body = `Hello,

Please could you raise a ticket for ${userName}.

Issue summary:
${firstUser.slice(0, 600)}

This was discussed with the IT Service Desk assistant but could not be resolved automatically. Please follow up to assist.

Thank you.`;
  return { subject, body };
}

/**
 * Generate an AI subject + body summarising the conversation for handoff.
 * Falls back to a deterministic summary if AI is unavailable.
 */
export async function generateEscalationSummary(
  userName: string,
  messages: { role: string; content: string }[],
): Promise<EscalationSummary> {
  const adapter = getAiAdapter();

  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt: ChatMessage[] = [
    {
      role: "system",
      content:
        "You write concise IT Service Desk escalation emails. Produce a short summary email, not a transcript. Always write in British English regardless of the language used in the conversation. Do not use em dashes. Return strict JSON only.",
    },
    {
      role: "user",
      content: `Summarise this IT support conversation into an escalation email for the Service Desk. Include: the issue, what was already tried in the chat, and what is still outstanding. End the body with a polite request to open a ticket for ${userName}'s issue and include their name.

IMPORTANT: Write the subject and body in English only, even if the conversation below is in another language.

Return JSON exactly as: {"subject": "...", "body": "..."}
Keep the body under 1500 characters.

Conversation:
${transcript}`,
    },
  ];

  try {
    const res = await adapter.complete({ messages: prompt });
    const parsed = extractJson(res.text);
    if (parsed?.subject && parsed?.body) {
      return {
        subject: String(parsed.subject).slice(0, 200),
        body: String(parsed.body),
      };
    }
  } catch (err) {
    console.error("Escalation summary error:", (err as Error).message);
  }
  return fallbackSummary(userName, messages);
}

function extractJson(text: string): { subject?: string; body?: string } | null {
  // Tolerate code fences or surrounding prose.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** Build a length-capped, URL-encoded mailto: link. Newlines -> %0D%0A. */
export function buildMailto(
  to: string,
  subject: string,
  body: string,
): string {
  // Trim body so the whole URL stays under the practical ceiling.
  let safeBody = body;
  const encode = (s: string) =>
    encodeURIComponent(s).replace(/%20/g, "%20").replace(/\n/g, "%0D%0A");

  const build = (b: string) =>
    `mailto:${to}?subject=${encode(subject)}&body=${encode(b)}`;

  let url = build(safeBody);
  if (url.length > MAILTO_MAX) {
    const overBy = url.length - MAILTO_MAX;
    // Rough trim: remove a bit more than the overflow to account for encoding.
    safeBody = safeBody.slice(0, Math.max(0, safeBody.length - overBy - 40)) +
      "\n\n(Summary truncated. Full details available on request.)";
    url = build(safeBody);
  }
  return url;
}

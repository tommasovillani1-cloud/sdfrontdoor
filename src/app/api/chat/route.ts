import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/identity";
import { getAiAdapter } from "@/lib/ai";
import type { ChatMessage } from "@/lib/ai/types";
import { CHAT_TOOLS } from "@/lib/chat/tools";
import { getSystemPrompt } from "@/lib/settings";
import { redactSecrets } from "@/lib/chat/redact";
import { deriveTitle } from "@/lib/chat/conversations";
import { getRetriever, buildGroundingBlock } from "@/lib/kb/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(8000),
});

/**
 * POST /api/chat
 * Streams an assistant reply (Server-Sent-Events style newline-delimited JSON).
 * Creates the conversation on first message, persists user + assistant turns,
 * injects KB grounding (empty-KB safe), and surfaces the resolution-check tool.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return new Response("Unauthorised: no forwarded identity.", { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response("Bad request.", { status: 400 });
  }
  const { conversationId, message } = parsed.data;

  // Light secret redaction before storage.
  const { text: userText, redacted } = redactSecrets(message);

  // Resolve or create the conversation (must belong to the user).
  let convo = conversationId
    ? await prisma.conversation.findFirst({
        where: { id: conversationId, userId: user.id, deletedAt: null },
      })
    : null;

  if (!convo) {
    convo = await prisma.conversation.create({
      data: {
        userId: user.id,
        status: "active",
        title: deriveTitle(userText),
      },
    });
  } else {
    // Reopening a resolved conversation and sending a new message reactivates it.
    if (convo.status === "resolved") {
      convo = await prisma.conversation.update({
        where: { id: convo.id },
        data: { status: "active", resolvedAt: null },
      });
    }
    // If the conversation still has the placeholder title, set it now.
    if (convo.title === "New conversation") {
      convo = await prisma.conversation.update({
        where: { id: convo.id },
        data: { title: deriveTitle(userText) },
      });
    }
  }

  // Persist the user message.
  await prisma.message.create({
    data: { conversationId: convo.id, role: "user", content: userText },
  });

  // Build the message history for the model.
  const history = await prisma.message.findMany({
    where: { conversationId: convo.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });

  // KB grounding (clean no-op when KB is empty/unprovisioned).
  let grounding = "";
  try {
    const chunks = await getRetriever().retrieve({ query: userText, topK: 5 });
    grounding = buildGroundingBlock(chunks);
  } catch {
    grounding = "";
  }

  const systemPrompt = await getSystemPrompt();
  const systemContent = grounding
    ? `${systemPrompt}\n\n---\n${grounding}`
    : systemPrompt;

  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({
      role: m.role as ChatMessage["role"],
      content: m.content,
    })),
  ];

  const adapter = getAiAdapter();
  const encoder = new TextEncoder();
  const convoId = convo.id;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      // Tell the client which conversation this is (for first message) and
      // whether we redacted anything.
      send({ type: "meta", conversationId: convoId, title: convo!.title, redacted });

      let assistantText = "";
      let tokensIn: number | null = null;
      let tokensOut: number | null = null;
      let usedModel = "";
      let resolutionSummary: string | null = null;

      try {
        for await (const ev of adapter.streamChat({
          messages,
          tools: CHAT_TOOLS,
        })) {
          if (ev.type === "text") {
            assistantText += ev.delta;
            send({ type: "text", delta: ev.delta });
          } else if (ev.type === "tool_call") {
            if (ev.toolCall.name === "propose_resolution_check") {
              try {
                const args = JSON.parse(ev.toolCall.arguments || "{}");
                resolutionSummary =
                  typeof args.summary === "string" ? args.summary : "";
              } catch {
                resolutionSummary = "";
              }
              send({ type: "resolution_check", summary: resolutionSummary });
            }
          } else if (ev.type === "done") {
            tokensIn = ev.usage.tokensIn;
            tokensOut = ev.usage.tokensOut;
            usedModel = ev.model;
          }
        }
      } catch (err) {
        console.error("Chat stream error:", (err as Error).message);
        send({
          type: "error",
          message:
            "Something went wrong generating a reply. You can try again or escalate to the Service Desk.",
        });
      }

      // Persist the assistant message (even if empty + only a tool call, store
      // a short note so history stays coherent).
      const contentToStore =
        assistantText.trim() ||
        (resolutionSummary
          ? `Proposed resolution: ${resolutionSummary}`
          : "");
      if (contentToStore) {
        const saved = await prisma.message.create({
          data: {
            conversationId: convoId,
            role: "assistant",
            content: contentToStore,
            model: usedModel || null,
            tokensIn,
            tokensOut,
          },
        });
        send({ type: "saved", messageId: saved.id });
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

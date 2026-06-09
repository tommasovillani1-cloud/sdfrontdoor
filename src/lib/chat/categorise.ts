import { prisma } from "@/lib/db";
import { getAiAdapter, isAiConfigured } from "@/lib/ai";
import type { ChatMessage } from "@/lib/ai/types";

/**
 * When a conversation reaches resolved/escalated, make a separate server-side
 * model call that returns one category (by name) from the active list as JSON.
 * Stores category_id. Best-effort: if AI is unavailable or returns nonsense,
 * fall back to "Other / Uncategorised". Never throws into the caller.
 */
export async function categoriseConversation(
  conversationId: string,
): Promise<void> {
  try {
    const convo = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } },
    });
    if (!convo) return;

    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    if (!categories.length) return;

    const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
    const other =
      categories.find((c) => c.name === "Other / Uncategorised") ??
      categories[categories.length - 1];

    let chosen = other;

    if (isAiConfigured()) {
      const transcript = convo.messages
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")
        .slice(0, 6000);

      const names = categories.map((c) => c.name);
      const prompt: ChatMessage[] = [
        {
          role: "system",
          content:
            "You categorise IT support conversations. Choose exactly one category from the provided list. Return strict JSON only.",
        },
        {
          role: "user",
          content: `Categories:\n${names.map((n) => `- ${n}`).join("\n")}\n\nConversation:\n${transcript}\n\nReturn JSON exactly as: {"category": "<one of the category names above>"}`,
        },
      ];

      try {
        const res = await getAiAdapter().complete({ messages: prompt });
        const match = res.text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { category?: string };
          if (parsed.category) {
            const found = byName.get(parsed.category.trim().toLowerCase());
            if (found) chosen = found;
          }
        }
      } catch (err) {
        console.error("Categorise AI error:", (err as Error).message);
      }
    }

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { categoryId: chosen.id },
    });
  } catch (err) {
    console.error("categoriseConversation error:", (err as Error).message);
  }
}

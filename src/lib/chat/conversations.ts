import { prisma } from "@/lib/db";
import { truncate } from "@/lib/utils";
import type { Conversation, Message } from "@prisma/client";

/** Derive a short conversation title from the first user message. */
export function deriveTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  return truncate(cleaned, 60);
}

/** List a user's own conversations, newest first, excluding soft-deleted. */
export async function listConversations(userId: string, search?: string) {
  const where = {
    userId,
    deletedAt: null,
    ...(search && search.trim()
      ? {
          OR: [
            { title: { contains: search.trim(), mode: "insensitive" as const } },
            {
              messages: {
                some: {
                  content: {
                    contains: search.trim(),
                    mode: "insensitive" as const,
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  return prisma.conversation.findMany({
    where,
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      startedAt: true,
      categoryId: true,
    },
  });
}

/** Get a conversation the user owns, with messages in order. */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<(Conversation & { messages: Message[] }) | null> {
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, userId, deletedAt: null },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return convo;
}

/** Create a new active conversation for a user. */
export async function createConversation(userId: string) {
  return prisma.conversation.create({
    data: { userId, status: "active" },
  });
}

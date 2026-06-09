import { resolveCurrentUser } from "@/lib/identity";
import { getConversation } from "@/lib/chat/conversations";
import { timeOfDayGreeting, firstNameFrom } from "@/lib/utils";
import { isAiConfigured } from "@/lib/ai";
import { ChatClient } from "@/components/chat/ChatClient";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { c?: string };
}) {
  const user = await resolveCurrentUser();
  if (!user) return null; // layout handles the no-identity case

  const firstName = firstNameFrom(user.displayName, user.email);
  const greeting = timeOfDayGreeting(firstName);

  // Load an existing conversation if one is selected.
  const conversationId = searchParams.c;
  const convo = conversationId
    ? await getConversation(user.id, conversationId)
    : null;

  return (
    <ChatClient
      greeting={greeting}
      aiConfigured={isAiConfigured()}
      initialConversation={
        convo
          ? {
              id: convo.id,
              title: convo.title,
              status: convo.status,
              messages: convo.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
              })),
            }
          : null
      }
    />
  );
}

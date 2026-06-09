"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, ShieldAlert, Loader2, Sparkles } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { ResolutionCheck } from "./ResolutionCheck";
import { EscalationCard } from "./EscalationCard";
import { ScopeNotice } from "./ScopeNotice";

export interface UiMessage {
  id: string;
  role: string;
  content: string;
  /** transient: streaming in progress */
  streaming?: boolean;
}

interface InitialConversation {
  id: string;
  title: string;
  status: string;
  messages: { id: string; role: string; content: string }[];
}

export function ChatClient({
  greeting,
  aiConfigured,
  initialConversation,
}: {
  greeting: string;
  aiConfigured: boolean;
  initialConversation: InitialConversation | null;
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversation?.id ?? null,
  );
  const [status, setStatus] = useState<string>(
    initialConversation?.status ?? "active",
  );
  const [messages, setMessages] = useState<UiMessage[]>(
    initialConversation?.messages ?? [],
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState<string | null>(
    null,
  );
  const [escalation, setEscalation] = useState<{
    mailto: string;
    subject: string;
    body: string;
    toEmail: string;
  } | null>(null);
  const [redactionNotice, setRedactionNotice] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Keep state in sync when navigating between conversations.
  useEffect(() => {
    setConversationId(initialConversation?.id ?? null);
    setStatus(initialConversation?.status ?? "active");
    setMessages(initialConversation?.messages ?? []);
    setResolutionSummary(null);
    setEscalation(null);
  }, [initialConversation]);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, resolutionSummary, escalation, scrollToBottom]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setResolutionSummary(null);
    setEscalation(null);
    setInput("");

    // Optimistic user message.
    const tempUserId = `tmp-u-${Date.now()}`;
    const tempAssistantId = `tmp-a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: "user", content: text },
      { id: tempAssistantId, role: "assistant", content: "", streaming: true },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let newConvId = conversationId;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          handleEvent(ev, tempAssistantId, (id) => (newConvId = id));
        }
      }

      // If this was the first message, sync the URL + sidebar.
      if (!conversationId && newConvId) {
        setConversationId(newConvId);
        router.replace(`/?c=${newConvId}`);
        router.refresh();
      } else {
        router.refresh(); // refresh sidebar (title/status)
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? {
                ...m,
                streaming: false,
                content:
                  m.content ||
                  "Sorry, something went wrong. Please try again or escalate to the Service Desk.",
              }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const handleEvent = (
    ev: Record<string, unknown>,
    tempAssistantId: string,
    setConvId: (id: string) => void,
  ) => {
    switch (ev.type) {
      case "meta":
        if (typeof ev.conversationId === "string") setConvId(ev.conversationId);
        if (ev.redacted === true) setRedactionNotice(true);
        break;
      case "text":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? { ...m, content: m.content + (ev.delta as string) }
              : m,
          ),
        );
        break;
      case "resolution_check":
        setResolutionSummary((ev.summary as string) ?? "");
        break;
      case "saved":
        // Replace the temp assistant id with the real one (for feedback).
        if (typeof ev.messageId === "string") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId
                ? { ...m, id: ev.messageId as string, streaming: false }
                : m,
            ),
          );
        }
        break;
      case "error":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? { ...m, streaming: false, content: (ev.message as string) ?? "" }
              : m,
          ),
        );
        break;
      case "done":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId ? { ...m, streaming: false } : m,
          ),
        );
        break;
    }
  };

  const onResolution = async (resolved: boolean) => {
    if (!conversationId) return;
    setResolutionSummary(null);
    if (resolved) {
      await fetch(`/api/conversations/${conversationId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
      setStatus("resolved");
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: "system",
          content: "Marked as resolved. Thank you, and glad that helped.",
        },
      ]);
      router.refresh();
    } else {
      await startEscalation();
    }
  };

  const startEscalation = async () => {
    if (!conversationId) return;
    setResolutionSummary(null);
    const res = await fetch(`/api/conversations/${conversationId}/escalate`, {
      method: "POST",
    });
    if (res.ok) {
      const data = await res.json();
      setEscalation({
        mailto: data.mailto,
        subject: data.subject,
        body: data.body,
        toEmail: data.toEmail,
      });
      setStatus("escalated");
      router.refresh();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable transcript */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {isEmpty ? (
            <Welcome greeting={greeting} aiConfigured={aiConfigured} />
          ) : (
            <div className="space-y-5">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  id={m.id}
                  role={m.role}
                  content={m.content}
                  streaming={m.streaming}
                />
              ))}

              {resolutionSummary !== null && (
                <ResolutionCheck
                  summary={resolutionSummary}
                  onAnswer={onResolution}
                />
              )}

              {escalation && (
                <EscalationCard
                  mailto={escalation.mailto}
                  subject={escalation.subject}
                  body={escalation.body}
                  toEmail={escalation.toEmail}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          {redactionNotice && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-ink-muted">
              <ShieldAlert className="h-3.5 w-3.5 text-orange" />
              For your security, content that looked like a password or code was
              removed before saving. Never share passwords or MFA codes.
            </p>
          )}
          {status !== "active" && !escalation && (
            <p className="mb-2 text-xs text-ink-muted">
              This conversation is {status}. Sending a new message will reopen
              it.
            </p>
          )}
          <div className="flex items-end gap-2 rounded-card border border-line bg-surface p-2 focus-within:border-brilliant focus-within:ring-2 focus-within:ring-brilliant/30">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Describe your IT issue..."
              aria-label="Message"
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
            />
            <div className="flex items-center gap-1">
              {!escalation && conversationId && (
                <button
                  onClick={startEscalation}
                  className="btn-ghost px-2.5 py-2 text-xs"
                  title="Hand off to the Service Desk"
                >
                  Escalate
                </button>
              )}
              <button
                onClick={send}
                disabled={!input.trim() || sending}
                className="btn-primary h-9 w-9 !px-0"
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-ink-subtle">
            Element Six IT Service Desk assistant. Do not share passwords or MFA
            codes.
          </p>
        </div>
      </div>
    </div>
  );
}

function Welcome({
  greeting,
  aiConfigured,
}: {
  greeting: string;
  aiConfigured: boolean;
}) {
  const suggestions = [
    "I cannot connect to the VPN",
    "My Outlook is not syncing",
    "I need to reset access to a shared mailbox",
    "My laptop is running very slowly",
  ];
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange/10">
        <Sparkles className="h-6 w-6 text-orange" />
      </span>
      <h1 className="text-2xl font-semibold text-ink">{greeting}</h1>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        I am the Element Six IT Service Desk assistant. Tell me what IT issue you
        are having and I will help you resolve it, or hand you over to the
        Service Desk if needed.
      </p>
      {!aiConfigured && <ScopeNotice />}
      <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <SuggestionChip key={s} text={s} />
        ))}
      </div>
    </div>
  );
}

function SuggestionChip({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="Message"]',
        );
        if (ta) {
          ta.value = text;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          // React-controlled: set via native setter then focus.
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value",
          )?.set;
          setter?.call(ta, text);
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          ta.focus();
        }
      }}
      className="rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-sm text-ink-muted transition-colors hover:border-orange/40 hover:bg-orange/5 hover:text-ink"
    >
      {text}
    </button>
  );
}

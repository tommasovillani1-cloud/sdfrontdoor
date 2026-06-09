"use client";

import { Mail, ExternalLink } from "lucide-react";

/** Shown after escalation: a pre-filled mailto button plus a preview of the
 *  AI-generated summary that will be sent to the Service Desk. */
export function EscalationCard({
  mailto,
  subject,
  body,
  toEmail,
}: {
  mailto: string;
  subject: string;
  body: string;
  toEmail: string;
}) {
  return (
    <div className="animate-fade-in rounded-card border border-orange/30 bg-orange/5 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange/15 text-orange">
          <Mail className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">
            Handing you over to the Service Desk
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            I have prepared an email to {toEmail}. Click below to open it in your
            mail client, then send it to raise a ticket.
          </p>

          <a
            href={mailto}
            className="btn-primary mt-3 inline-flex"
          >
            <ExternalLink className="h-4 w-4" />
            Open pre-filled email
          </a>

          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-ink-muted hover:text-ink">
              Preview the summary
            </summary>
            <div className="mt-2 rounded-lg border border-line bg-surface p-3">
              <p className="font-medium text-ink">Subject: {subject}</p>
              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-ink-muted">
                {body}
              </pre>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

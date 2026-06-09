"use client";

import { useState } from "react";
import { Loader2, Save, Lock } from "lucide-react";
import type { ServiceNowConfigPublic } from "@/lib/servicenow/types";

export function ServiceNowForm({
  initial,
}: {
  initial: ServiceNowConfigPublic;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [instanceUrl, setInstanceUrl] = useState(initial.instanceUrl);
  const [authType, setAuthType] = useState(initial.authType);
  const [oauthClientId, setOauthClientId] = useState(initial.oauthClientId ?? "");
  const [oauthTokenUrl, setOauthTokenUrl] = useState(initial.oauthTokenUrl ?? "");
  const [username, setUsername] = useState(initial.username ?? "");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/servicenow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          instanceUrl,
          authType,
          oauthClientId: oauthClientId || undefined,
          oauthClientSecret: oauthClientSecret || undefined,
          oauthTokenUrl: oauthTokenUrl || undefined,
          username: username || undefined,
          password: password || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save.");
        return;
      }
      setSaved(true);
      setOauthClientSecret("");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-4 p-5">
      <label className="flex items-center justify-between rounded-lg bg-surface-inset px-4 py-3">
        <span>
          <span className="block text-sm font-medium text-ink">
            Enable integration
          </span>
          <span className="block text-xs text-ink-muted">
            When off, no ServiceNow calls are made.
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((e) => !e)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            enabled ? "bg-vibrant" : "bg-cool"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </label>

      <div>
        <label className="label">Instance URL</label>
        <input
          className="input"
          placeholder="https://yourinstance.service-now.com"
          value={instanceUrl}
          onChange={(e) => setInstanceUrl(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Authentication type</label>
        <select
          className="input"
          value={authType}
          onChange={(e) => setAuthType(e.target.value as typeof authType)}
        >
          <option value="oauth2_client_credentials">
            OAuth 2.0 (client credentials)
          </option>
          <option value="basic">Basic / integration user</option>
        </select>
        <p className="mt-1 text-xs text-ink-subtle">
          OAuth 2.0 with a scoped integration user is usually the easier
          internal approval than a long-lived API key.
        </p>
      </div>

      {authType === "oauth2_client_credentials" ? (
        <div className="space-y-3">
          <div>
            <label className="label">OAuth client ID</label>
            <input
              className="input"
              value={oauthClientId}
              onChange={(e) => setOauthClientId(e.target.value)}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" />
              OAuth client secret
            </label>
            <input
              className="input"
              type="password"
              placeholder={initial.hasClientSecret ? "•••• (leave blank to keep)" : ""}
              value={oauthClientSecret}
              onChange={(e) => setOauthClientSecret(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Token URL (optional)</label>
            <input
              className="input"
              placeholder="defaults to <instance>/oauth_token.do"
              value={oauthTokenUrl}
              onChange={(e) => setOauthTokenUrl(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="label flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" />
              Password
            </label>
            <input
              className="input"
              type="password"
              placeholder={initial.hasPassword ? "•••• (leave blank to keep)" : ""}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-orange">{error}</p>}
      {saved && (
        <p className="text-sm text-[rgb(80,120,30)]">Saved securely.</p>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="btn-primary text-sm">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save settings
        </button>
      </div>

      <div className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-ink-muted">
        <p className="font-medium text-ink">Scaffolded capabilities (v1: stubs)</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>Log an incident ticket</li>
          <li>Log a change request</li>
          <li>Get status of a ticket or change request</li>
          <li>Resolve a ticket or change request</li>
          <li>Read the content of an existing ticket</li>
        </ul>
      </div>
    </div>
  );
}

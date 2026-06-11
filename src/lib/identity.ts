import { headers } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { getGraphProfile } from "./graph";

/**
 * User recognition with no app-level login (section 5).
 *
 * Databricks Apps authenticate the user at the platform level and forward
 * identity headers. We trust X-Forwarded-Email as the primary identity,
 * resolve or create the local user, enrich from Graph, and update last_seen.
 *
 * Locally there is no Databricks proxy, so DEV_FORWARDED_EMAIL simulates it.
 */

export interface ForwardedIdentity {
  email: string;
  preferredUsername: string | null;
  forwardedUser: string | null;
  /** display name hint from the dev override; production gets it from Graph */
  nameHint: string | null;
}

/** Read forwarded identity headers, falling back to the dev override. */
export function readForwardedIdentity(): ForwardedIdentity | null {
  const h = headers();

  const email =
    h.get("x-forwarded-email") ||
    h.get("x-forwarded-preferred-username") ||
    env.dev.forwardedEmail ||
    "";

  if (!email) return null;

  return {
    email: email.trim().toLowerCase(),
    preferredUsername: h.get("x-forwarded-preferred-username"),
    forwardedUser: h.get("x-forwarded-user"),
    nameHint: env.dev.forwardedName || null,
  };
}

/**
 * Resolve the current user: create on first sighting, update last_seen always,
 * enrich from Graph (displayName + country->site). Returns null if no identity
 * is present (should not happen inside Databricks; possible locally if the dev
 * override is blank).
 */
export async function resolveCurrentUser(): Promise<User | null> {
  const identity = readForwardedIdentity();
  if (!identity) return null;

  const { email } = identity;
  const isDefaultAdmin = env.defaultAdmins.includes(email);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Update last_seen on every request. Promote to admin if newly added to
    // DEFAULT_ADMINS, but never auto-demote (admins are managed in the UI).
    // Refresh site/preferredLanguage from Graph if either is still unpopulated.
    const data: {
      lastSeenAt: Date;
      isAdmin?: boolean;
      site?: string;
      preferredLanguage?: string;
    } = { lastSeenAt: new Date() };
    if (isDefaultAdmin && !existing.isAdmin) data.isAdmin = true;
    if (!existing.preferredLanguage || !existing.site || existing.site === "Unknown") {
      const profile = await getGraphProfile(email);
      if (profile?.country?.trim()) data.site = profile.country.trim();
      if (profile?.preferredLanguage) data.preferredLanguage = profile.preferredLanguage;
    }
    return prisma.user.update({ where: { email }, data });
  }

  // First sighting: enrich from Graph (may be null locally), then create.
  const profile = await getGraphProfile(email);
  const displayName = profile?.displayName || identity.nameHint || null;
  const site = profile?.country?.trim() ? profile.country.trim() : "Unknown";

  return prisma.user.create({
    data: {
      email,
      displayName,
      site,
      preferredLanguage: profile?.preferredLanguage ?? null,
      isAdmin: isDefaultAdmin,
    },
  });
}

/** Convenience: resolve user or throw (for routes that require identity). */
export async function requireUser(): Promise<User> {
  const user = await resolveCurrentUser();
  if (!user) {
    throw new Error("No forwarded identity present.");
  }
  return user;
}

/** Resolve user and require admin; throws if not admin. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new Error("Admin access required.");
  }
  return user;
}

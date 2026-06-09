import { prisma } from "./db";
import { env } from "./env";
import {
  SETTINGS_KEYS,
  DEFAULT_SYSTEM_PROMPT,
  type SyncCadence,
} from "./constants";

/** Generic getter: returns the stored JSON value or a fallback. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value as T;
}

/** Generic setter (upsert). */
export async function setSetting(
  key: string,
  value: unknown,
): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}

// --- System prompt (versioned) --------------------------------------------

export async function getSystemPrompt(): Promise<string> {
  return getSetting<string>(SETTINGS_KEYS.systemPrompt, DEFAULT_SYSTEM_PROMPT);
}

/**
 * Update the system prompt and append a version-history row so changes to
 * assistant behaviour are auditable and revertible.
 */
export async function setSystemPrompt(
  content: string,
  editedBy: string | null,
  note?: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: SETTINGS_KEYS.systemPrompt },
      create: { key: SETTINGS_KEYS.systemPrompt, value: content },
      update: { value: content },
    }),
    prisma.systemPromptVersion.create({
      data: { content, editedBy, note },
    }),
  ]);
}

// --- Retention -------------------------------------------------------------

export async function getRetentionMonths(): Promise<number> {
  return getSetting<number>(
    SETTINGS_KEYS.retentionMonths,
    env.retentionMonths,
  );
}

// --- KB sync cadence -------------------------------------------------------

export async function getSyncCadence(): Promise<SyncCadence> {
  return getSetting<SyncCadence>(
    SETTINGS_KEYS.kbSyncCadence,
    env.kb.defaultCadence as SyncCadence,
  );
}

export async function getLastSyncAt(): Promise<string | null> {
  return getSetting<string | null>(SETTINGS_KEYS.kbLastSyncAt, null);
}

import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

/**
 * Record an admin action in the audit log. Never throws into the caller's
 * flow: an audit failure should not break the action it records, but it is
 * logged to the server console.
 */
export async function recordAudit(params: {
  actorUserId: string | null;
  action: string;
  target?: string | null;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId,
        action: params.action,
        target: params.target ?? null,
        metadata: params.metadata,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", (err as Error).message);
  }
}

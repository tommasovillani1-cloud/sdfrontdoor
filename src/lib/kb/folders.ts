import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sanitiseSegment, buildFolderPath } from "./paths";
import { createVolumeDirectory } from "./databricks";

/**
 * Folder tree service. The hierarchy the admin builds is mirrored as the path
 * structure in the Volume. Folder paths are derived from the chain of names.
 */

export interface FolderNode {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  children: FolderNode[];
  documentCount: number;
}

/** Compute a folder's path by walking up to the root. */
async function computePath(
  name: string,
  parentId: string | null,
): Promise<string> {
  const segments: string[] = [sanitiseSegment(name)];
  let cur = parentId;
  // Guard depth.
  let depth = 0;
  while (cur && depth < 50) {
    const parent = await prisma.kbFolder.findUnique({ where: { id: cur } });
    if (!parent) break;
    segments.unshift(sanitiseSegment(parent.name));
    cur = parent.parentId;
    depth++;
  }
  return buildFolderPath(env.kb.volumePath || "/Volumes/kb", segments);
}

export async function createFolder(name: string, parentId: string | null) {
  const path = await computePath(name, parentId);
  const folder = await prisma.kbFolder.create({
    data: { name: sanitiseSegment(name), parentId, path },
  });
  // Mirror in the Volume (no-op when Databricks not configured).
  await createVolumeDirectory(path);
  return folder;
}

export async function renameFolder(id: string, newName: string) {
  const folder = await prisma.kbFolder.findUnique({ where: { id } });
  if (!folder) throw new Error("Folder not found");
  const path = await computePath(newName, folder.parentId);
  return prisma.kbFolder.update({
    where: { id },
    data: { name: sanitiseSegment(newName), path },
  });
}

export async function deleteFolder(id: string) {
  // Cascades to children + documents via schema relations.
  return prisma.kbFolder.delete({ where: { id } });
}

/** Build the full nested folder tree with document counts. */
export async function getFolderTree(): Promise<FolderNode[]> {
  const [folders, counts] = await Promise.all([
    prisma.kbFolder.findMany({ orderBy: { name: "asc" } }),
    prisma.kbDocument.groupBy({ by: ["folderId"], _count: { _all: true } }),
  ]);

  const countByFolder = new Map(
    counts.map((c) => [c.folderId, c._count._all]),
  );

  const nodeById = new Map<string, FolderNode>();
  for (const f of folders) {
    nodeById.set(f.id, {
      id: f.id,
      parentId: f.parentId,
      name: f.name,
      path: f.path,
      children: [],
      documentCount: countByFolder.get(f.id) ?? 0,
    });
  }

  const roots: FolderNode[] = [];
  for (const node of nodeById.values()) {
    if (node.parentId && nodeById.has(node.parentId)) {
      nodeById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

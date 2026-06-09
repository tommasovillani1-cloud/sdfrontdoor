/**
 * Filename and Volume-path handling for the KB.
 *
 * CRITICAL (brief sections 6 + 10): preserve original filenames verbatim. Do
 * NOT rename uploads to generated IDs/hashes. Sanitise only characters that are
 * illegal in a Volume path, keep the human-readable name, and on a name
 * collision within the same folder append a version suffix (e.g. "name (2).pdf")
 * rather than overwriting or substituting an ID.
 */

/**
 * Characters genuinely illegal/problematic in a path component: the Windows/
 * POSIX-unsafe set plus control characters. Everything else (letters, digits,
 * spaces, dots, dashes, parentheses) is preserved so the human-readable name
 * survives intact.
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL = /[<>:"/\\|?*\x00-\x1f]+/g;

/** Sanitise a single path segment (folder name or filename) minimally. */
export function sanitiseSegment(name: string): string {
  const cleaned = name
    .replace(ILLEGAL, "_")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .trim();
  return cleaned || "untitled";
}

/** Split a filename into base + extension (extension includes the dot). */
export function splitExtension(filename: string): { base: string; ext: string } {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return { base: filename, ext: "" };
  return { base: filename.slice(0, idx), ext: filename.slice(idx) };
}

/**
 * Given the original filename and the set of filenames already present in the
 * folder, return a non-colliding filename that preserves the original name,
 * appending " (n)" before the extension on collision.
 */
export function resolveCollision(
  originalFilename: string,
  existing: Set<string>,
): { filename: string; version: number } {
  const safe = sanitiseSegment(originalFilename);
  if (!existing.has(safe)) return { filename: safe, version: 1 };

  const { base, ext } = splitExtension(safe);
  let n = 2;
  while (n < 10000) {
    const candidate = `${base} (${n})${ext}`;
    if (!existing.has(candidate)) return { filename: candidate, version: n };
    n++;
  }
  return { filename: `${base} (${n})${ext}`, version: n };
}

/** Build a folder path under the Volume root, mirroring the folder tree. */
export function buildFolderPath(volumeRoot: string, segments: string[]): string {
  const root = volumeRoot.replace(/\/$/, "");
  const parts = segments.map(sanitiseSegment);
  return [root, ...parts].join("/");
}

/** Build the full document path (folder path + preserved filename). */
export function buildDocumentPath(folderPath: string, filename: string): string {
  return `${folderPath.replace(/\/$/, "")}/${filename}`;
}

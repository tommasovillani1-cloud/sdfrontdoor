import { getSystemPrompt } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { SystemPromptEditor } from "@/components/admin/SystemPromptEditor";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SystemPromptPage() {
  const [prompt, versions] = await Promise.all([
    getSystemPrompt(),
    prisma.systemPromptVersion.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">System prompt</h2>
        <p className="text-xs text-ink-muted">
          Controls the assistant&apos;s scope and tone. Changes take effect on
          the next message and are versioned below so you can review or revert.
          Do not use em dashes; any will be converted to hyphens on save.
        </p>
      </div>

      <SystemPromptEditor
        initial={prompt}
        history={versions.map((v) => ({
          id: v.id,
          content: v.content,
          editedBy: v.editedBy,
          note: v.note,
          createdAt: formatDateTime(v.createdAt),
        }))}
      />
    </div>
  );
}

import { prisma } from "@/lib/db";
import { CategoriesManager } from "@/components/admin/CategoriesManager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">Categories</h2>
        <p className="text-xs text-ink-muted">
          ITIL-aligned categories used to classify conversations. Add new ones
          or deactivate those you no longer use. Deactivating keeps historical
          data intact.
        </p>
      </div>
      <CategoriesManager
        initial={categories.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          itilMapping: c.itilMapping,
          isActive: c.isActive,
        }))}
      />
    </div>
  );
}

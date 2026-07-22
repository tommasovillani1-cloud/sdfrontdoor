-- Replace the Volume-upload KB model with a SharePoint folder source.

-- DropForeignKey
ALTER TABLE "kb_documents" DROP CONSTRAINT "kb_documents_folder_id_fkey";
ALTER TABLE "kb_folders" DROP CONSTRAINT "kb_folders_parent_id_fkey";

-- DropTable
DROP TABLE "kb_documents";
DROP TABLE "kb_folders";

-- DropEnum
DROP TYPE "KbDocumentStatus";

-- CreateTable
CREATE TABLE "kb_source" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "site_name" TEXT NOT NULL,
    "drive_id" TEXT NOT NULL,
    "drive_name" TEXT NOT NULL,
    "folder_item_id" TEXT NOT NULL,
    "folder_path" TEXT NOT NULL,
    "folder_name" TEXT NOT NULL,
    "include_subfolders" BOOLEAN NOT NULL DEFAULT true,
    "selected_by" TEXT,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sharepoint_browse_tokens" (
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sharepoint_browse_tokens_pkey" PRIMARY KEY ("user_id")
);

-- SharePoint browsing is now app-only (client-credentials), so the per-admin
-- delegated token store is obsolete. Drop it.
DROP TABLE IF EXISTS "sharepoint_browse_tokens";

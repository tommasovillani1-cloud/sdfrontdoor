-- Add preferred_language column to users (BCP-47 tag from Microsoft Graph)
ALTER TABLE "users" ADD COLUMN "preferred_language" TEXT;

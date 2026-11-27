-- 27 Nov 2026: tables and columns renamed to what they hold, and unused ones dropped (Changelog 2026-11-27).
--   "Admin" → "Account" (every panel account, clients too), "ApiKey" → "Project", "ApiKeyUsage" → "ProjectUsage",
--   column "apiKeyId" → "projectId" everywhere, constraint and index names to match.
--   Dropped (unused): table "AiCredit"; columns "Admin"."requestedPlan", "parentId", "demo";
--   "ApiKey"."ownerId", "showAuthors"; "LabelAi"."dailyLimit".
-- Runs before `prisma db push` (deploy.sh). Safe to run again: every step checks what is already done. One transaction.
BEGIN;
DO $$
DECLARE r record; nn text;
BEGIN
  IF to_regclass('public."Admin"') IS NOT NULL AND to_regclass('public."Account"') IS NULL THEN
    ALTER TABLE "Admin" RENAME TO "Account";
  END IF;
  IF to_regclass('public."ApiKey"') IS NOT NULL AND to_regclass('public."Project"') IS NULL THEN
    ALTER TABLE "ApiKey" RENAME TO "Project";
  END IF;
  IF to_regclass('public."ApiKeyUsage"') IS NOT NULL AND to_regclass('public."ProjectUsage"') IS NULL THEN
    ALTER TABLE "ApiKeyUsage" RENAME TO "ProjectUsage";
  END IF;

  FOR r IN SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'apiKeyId' LOOP
    EXECUTE format('ALTER TABLE %I RENAME COLUMN "apiKeyId" TO "projectId"', r.table_name);
  END LOOP;

  -- Constraints first (renaming one renames its index), then the remaining plain indexes.
  FOR r IN SELECT c.conname AS name, t.relname AS tbl FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public'
           AND (c.conname ~ '^(Admin|ApiKey|ApiKeyUsage)_' OR c.conname LIKE '%apiKeyId%') LOOP
    nn := replace(regexp_replace(regexp_replace(r.name, '^Admin_', 'Account_'), '^ApiKey', 'Project'), 'apiKeyId', 'projectId');
    EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r.tbl, r.name, nn);
  END LOOP;
  FOR r IN SELECT i.relname AS name FROM pg_class i JOIN pg_namespace n ON n.oid = i.relnamespace
           WHERE n.nspname = 'public' AND i.relkind = 'i' AND (i.relname ~ '^(Admin|ApiKey|ApiKeyUsage)_' OR i.relname LIKE '%apiKeyId%') LOOP
    nn := replace(regexp_replace(regexp_replace(r.name, '^Admin_', 'Account_'), '^ApiKey', 'Project'), 'apiKeyId', 'projectId');
    EXECUTE format('ALTER INDEX %I RENAME TO %I', r.name, nn);
  END LOOP;
END $$;

DROP TABLE IF EXISTS "AiCredit";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "requestedPlan", DROP COLUMN IF EXISTS "parentId", DROP COLUMN IF EXISTS "demo";
ALTER TABLE "Project" DROP COLUMN IF EXISTS "ownerId", DROP COLUMN IF EXISTS "showAuthors";
ALTER TABLE "LabelAi" DROP COLUMN IF EXISTS "dailyLimit";
COMMIT;

-- 26 Nov 2026: ItemLabel holds several labels per item (primary key gains "label", new column "source").
-- `prisma db push` refuses a primary key change, so it is done here; deploy.sh runs this before `db push`.
-- Runs after 2026-11-27-project-account-names.sql has renamed "apiKeyId" → "projectId" on a fresh database too, so the
-- key is written with whichever column exists. Safe to run again: skipped once "source" exists.
DO $$
DECLARE col text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ItemLabel' AND column_name = 'source') THEN
    RETURN;
  END IF;
  SELECT column_name INTO col FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ItemLabel' AND column_name IN ('projectId', 'apiKeyId') LIMIT 1;
  EXECUTE format('ALTER TABLE "ItemLabel" DROP CONSTRAINT "ItemLabel_pkey", ADD COLUMN "source" TEXT NOT NULL DEFAULT %L, '
    'ADD CONSTRAINT "ItemLabel_pkey" PRIMARY KEY (%I, "type", "code", "label")', 'human', col);
END $$;

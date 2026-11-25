-- ItemLabel: several labels per item. One ALTER TABLE, so it applies completely or not at all.
-- Run BEFORE deploying the code that needs it (prisma db push refuses a primary key change).
-- AlterTable
ALTER TABLE "ItemLabel" DROP CONSTRAINT "ItemLabel_pkey",
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'human',
ADD CONSTRAINT "ItemLabel_pkey" PRIMARY KEY ("apiKeyId", "type", "code", "label");


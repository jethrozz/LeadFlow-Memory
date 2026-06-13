/*
  Warnings:

  - Made the column `memorySpaceId` on table `Lead` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ArtifactRef" ALTER COLUMN "verifiedStatus" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "name" SET DEFAULT '',
ALTER COLUMN "industry" SET DEFAULT '',
ALTER COLUMN "targetCustomer" SET DEFAULT '',
ALTER COLUMN "targetCreators" SET DEFAULT '[]',
ALTER COLUMN "maxPostsPerRun" SET DEFAULT 10,
ALTER COLUMN "maxCommentsPerPost" SET DEFAULT 5,
ALTER COLUMN "playbookId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "displayName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "isDemoSeed" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "playbookId" SET DEFAULT '',
ALTER COLUMN "sourceType" SET DEFAULT '',
ALTER COLUMN "intentLevel" DROP NOT NULL,
ALTER COLUMN "memorySpaceId" SET NOT NULL,
ALTER COLUMN "memorySpaceId" SET DEFAULT '';

-- AlterTable
ALTER TABLE "LeadProfile" ADD COLUMN     "concerns" TEXT[],
ADD COLUMN     "needs" TEXT[],
ADD COLUMN     "sourceNote" TEXT,
ALTER COLUMN "industry" SET DEFAULT '',
ALTER COLUMN "playbookId" SET DEFAULT '',
ALTER COLUMN "summary" SET DEFAULT '',
ALTER COLUMN "intentLevel" DROP NOT NULL,
ALTER COLUMN "profileCompleteness" SET DEFAULT 0,
ALTER COLUMN "common" SET DEFAULT '{}',
ALTER COLUMN "fields" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "MemoryRef" ALTER COLUMN "memorySpaceId" SET DEFAULT '',
ALTER COLUMN "confidence" DROP NOT NULL;

-- CreateTable
CREATE TABLE "NextFollowup" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "usedMemoryRefs" TEXT[],
    "worker" TEXT,
    "nextBestAction" TEXT,
    "requiresHumanApproval" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NextFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NextFollowup_leadId_key" ON "NextFollowup"("leadId");

-- AddForeignKey
ALTER TABLE "NextFollowup" ADD CONSTRAINT "NextFollowup_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

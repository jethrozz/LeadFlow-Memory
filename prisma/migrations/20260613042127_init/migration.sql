-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'running', 'paused', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('discovered', 'qualified', 'assigned', 'contacting', 'replied', 'nurturing', 'asking_contact', 'contact_obtained', 'viewing_scheduled', 'converted', 'paused', 'lost');

-- CreateEnum
CREATE TYPE "IntentLevel" AS ENUM ('S', 'A', 'B', 'C', 'Ignore');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('not_started', 'opened', 'waiting_reply', 'customer_replied', 'agent_replied', 'contact_shared', 'viewing_discussed', 'closed');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'retrying');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('connected', 'disconnected', 'unavailable');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "city" TEXT,
    "targetCustomer" TEXT NOT NULL,
    "seedKeywords" TEXT[],
    "targetCreators" JSONB NOT NULL,
    "sourceModes" TEXT[],
    "maxPostsPerRun" INTEGER NOT NULL,
    "maxCommentsPerPost" INTEGER NOT NULL,
    "targetLeadCount" INTEGER NOT NULL DEFAULT 10,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleTimes" TEXT[] DEFAULT ARRAY['09:00', '14:00', '20:00']::TEXT[],
    "playbookId" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialSource" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "authorName" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,

    CONSTRAINT "SocialSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "socialSourceId" TEXT,
    "playbookId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'discovered',
    "intentLevel" "IntentLevel" NOT NULL,
    "sourceUrl" TEXT,
    "sourceAuthor" TEXT,
    "memorySpaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadProfile" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "playbookId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "intentLevel" "IntentLevel" NOT NULL,
    "profileCompleteness" DOUBLE PRECISION NOT NULL,
    "missingRequiredFields" TEXT[],
    "common" JSONB NOT NULL,
    "fields" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'not_started',
    "platform" TEXT NOT NULL,
    "externalThreadId" TEXT,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'queued',
    "leadId" TEXT,
    "campaignId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryRef" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "memorySpaceId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sourceArtifactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactRef" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "workflowRunId" TEXT,
    "artifactType" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "suiObjectId" TEXT,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedStatus" TEXT NOT NULL,

    CONSTRAINT "ArtifactRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "workflowRunId" TEXT,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "memoryRefs" TEXT[],
    "artifactRefs" TEXT[],
    "agentName" TEXT,
    "workerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialIdentity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "profileUrl" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceConfig" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "adbAddress" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'disconnected',
    "lastConnectedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadProfile_leadId_key" ON "LeadProfile"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_leadId_key" ON "Conversation"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialIdentity_leadId_key" ON "SocialIdentity"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceConfig_platform_deviceId_key" ON "DeviceConfig"("platform", "deviceId");

-- AddForeignKey
ALTER TABLE "SocialSource" ADD CONSTRAINT "SocialSource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_socialSourceId_fkey" FOREIGN KEY ("socialSourceId") REFERENCES "SocialSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadProfile" ADD CONSTRAINT "LeadProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRef" ADD CONSTRAINT "MemoryRef_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactRef" ADD CONSTRAINT "ArtifactRef_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactRef" ADD CONSTRAINT "ArtifactRef_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialIdentity" ADD CONSTRAINT "SocialIdentity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

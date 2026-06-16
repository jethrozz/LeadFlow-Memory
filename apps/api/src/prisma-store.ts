import { type Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type {
  ApiStore,
  StoredArtifactRef,
  StoredConversationMessage,
  StoredDevice,
  StoredLead,
  StoredMemoryRef,
  StoredNextFollowup,
  StoredProfile,
  StoredTimelineEvent,
} from "./store.js";

export function createPrismaStore(prisma: PrismaClient): ApiStore {
  return {
    // ── Campaigns ──────────────────────────────────────────────────

    async listCampaigns() {
      const rows = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" } });
      return rows.map(campaignToRecord);
    },

    async getCampaign(id) {
      const row = await prisma.campaign.findUnique({ where: { id } });
      return row ? campaignToRecord(row) : undefined;
    },

    async upsertCampaign(input) {
      const data = {
        name: (input.name as string) ?? "",
        industry: (input.industry as string) ?? "",
        city: (input.city as string) ?? null,
        targetCustomer: (input.targetCustomer as string) ?? "",
        seedKeywords: (input.seedKeywords as string[]) ?? [],
        targetCreators: (input.targetCreators ?? []) as Prisma.InputJsonValue,
        sourceModes: (input.sourceModes as string[]) ?? [],
        maxPostsPerRun: (input.maxPostsPerRun as number) ?? 10,
        maxCommentsPerPost: (input.maxCommentsPerPost as number) ?? 5,
        targetLeadCount: (input.targetLeadCount as number) ?? 10,
        scheduleEnabled: (input.scheduleEnabled as boolean) ?? false,
        scheduleTimes: (input.scheduleTimes as string[]) ?? ["09:00", "14:00", "20:00"],
        playbookId: (input.playbookId as string) ?? "",
        status: ((input.status as string) ?? "draft") as Prisma.CampaignCreateInput["status"],
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      };
      const row = await prisma.campaign.upsert({
        where: { id: input.id as string },
        create: { id: input.id as string, ...data },
        update: data,
      });
      return campaignToRecord(row);
    },

    // ── Leads ──────────────────────────────────────────────────────

    async upsertLead(lead) {
      const row = await prisma.lead.upsert({
        where: { id: lead.id },
        create: {
          id: lead.id,
          campaignId: lead.campaignId,
          platform: lead.platform,
          status: lead.status as Prisma.LeadCreateInput["status"],
          memorySpaceId: lead.memorySpaceId ?? "",
          displayName: lead.displayName ?? "",
          isDemoSeed: lead.isDemoSeed ?? false,
          intentLevel: (lead.intentLevel ?? undefined) as Prisma.LeadCreateInput["intentLevel"],
          sourceType: "",
          autoFollowupEnabled: lead.autoFollowupEnabled ?? false,
          nextActionAt: lead.nextActionAt ?? null,
          followupTouchCount: lead.followupTouchCount ?? 0,
        },
        update: {
          platform: lead.platform,
          status: lead.status as Prisma.LeadUpdateInput["status"],
          memorySpaceId: lead.memorySpaceId ?? "",
          displayName: lead.displayName ?? "",
          isDemoSeed: lead.isDemoSeed ?? false,
          intentLevel: (lead.intentLevel ?? undefined) as Prisma.LeadUpdateInput["intentLevel"],
          ...(lead.autoFollowupEnabled !== undefined ? { autoFollowupEnabled: lead.autoFollowupEnabled } : {}),
          ...(lead.nextActionAt !== undefined ? { nextActionAt: lead.nextActionAt } : {}),
          ...(lead.followupTouchCount !== undefined ? { followupTouchCount: lead.followupTouchCount } : {}),
        },
      });
      return leadFromPrisma(row);
    },

    async getLead(leadId) {
      const row = await prisma.lead.findUnique({ where: { id: leadId } });
      return row ? leadFromPrisma(row) : undefined;
    },

    async listLeads() {
      const rows = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } });
      return rows.map(leadFromPrisma);
    },

    async listActiveFollowupLeads(now, limit) {
      const rows = await prisma.lead.findMany({
        where: {
          autoFollowupEnabled: true,
          nextActionAt: { lte: now },
          status: { in: ["discovered", "contacting"] as never },
        },
        orderBy: { nextActionAt: "asc" },
        take: limit,
      });
      return rows.map(leadFromPrisma);
    },

    async updateLeadFollowupState(leadId, patch) {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          ...(patch.status !== undefined ? { status: patch.status as never } : {}),
          ...(patch.nextActionAt !== undefined ? { nextActionAt: patch.nextActionAt } : {}),
          ...(patch.followupTouchCount !== undefined ? { followupTouchCount: patch.followupTouchCount } : {}),
          ...(patch.autoFollowupEnabled !== undefined ? { autoFollowupEnabled: patch.autoFollowupEnabled } : {}),
        },
      });
    },

    async getDefaultDevice(): Promise<StoredDevice | undefined> {
      const row = await prisma.deviceConfig.findFirst({
        where: { status: "connected" as never },
        orderBy: { lastConnectedAt: "desc" },
      });
      if (!row) return undefined;
      return { deviceId: row.deviceId, adbAddress: row.adbAddress, status: row.status };
    },

    // ── Memory refs ────────────────────────────────────────────────

    async appendMemoryRef(input) {
      const row = await prisma.memoryRef.create({
        data: {
          leadId: input.leadId,
          memoryId: input.memoryId,
          kind: input.kind,
          summary: input.summary,
          confidence: input.confidence ?? null,
          sourceArtifactId: input.sourceArtifactBlobId ?? null,
        },
      });
      return {
        id: row.id,
        leadId: row.leadId,
        memoryId: row.memoryId,
        kind: row.kind,
        summary: row.summary,
        confidence: row.confidence ?? undefined,
        sourceArtifactBlobId: row.sourceArtifactId ?? undefined,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async listMemoryRefs(leadId) {
      const rows = await prisma.memoryRef.findMany({
        where: { leadId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        leadId: r.leadId,
        memoryId: r.memoryId,
        kind: r.kind,
        summary: r.summary,
        confidence: r.confidence ?? undefined,
        sourceArtifactBlobId: r.sourceArtifactId ?? undefined,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    // ── Artifact refs ──────────────────────────────────────────────

    async appendArtifactRef(input) {
      const row = await prisma.artifactRef.create({
        data: {
          leadId: input.leadId,
          artifactType: input.artifactType,
          blobId: input.blobId,
          suiObjectId: input.suiObjectId ?? null,
          summary: input.summary ?? "",
        },
      });
      return {
        id: row.id,
        leadId: row.leadId ?? "",
        artifactType: row.artifactType,
        blobId: row.blobId,
        suiObjectId: row.suiObjectId ?? undefined,
        summary: row.summary ?? undefined,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async listArtifactRefs(leadId) {
      const rows = await prisma.artifactRef.findMany({
        where: { leadId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        leadId: r.leadId ?? "",
        artifactType: r.artifactType,
        blobId: r.blobId,
        suiObjectId: r.suiObjectId ?? undefined,
        summary: r.summary ?? undefined,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    // ── Timeline events ────────────────────────────────────────────

    async appendTimelineEvent(input) {
      const row = await prisma.timelineEvent.create({
        data: {
          leadId: input.leadId,
          type: input.type,
          summary: input.summary,
          agentName: input.agentName ?? null,
          workerId: input.workerId ?? null,
          memoryRefs: input.memoryRefs,
          artifactRefs: input.artifactRefs,
        },
      });
      return {
        id: row.id,
        leadId: row.leadId,
        type: row.type,
        summary: row.summary,
        agentName: row.agentName ?? undefined,
        workerId: row.workerId ?? undefined,
        memoryRefs: row.memoryRefs,
        artifactRefs: row.artifactRefs,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async listTimelineEvents(leadId) {
      const rows = await prisma.timelineEvent.findMany({
        where: { leadId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        leadId: r.leadId,
        type: r.type,
        summary: r.summary,
        agentName: r.agentName ?? undefined,
        workerId: r.workerId ?? undefined,
        memoryRefs: r.memoryRefs,
        artifactRefs: r.artifactRefs,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    // ── Conversations ──────────────────────────────────────────────

    async appendConversationMessage(leadId, input) {
      // Ensure conversation exists
      let conversation = await prisma.conversation.findUnique({ where: { leadId } });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { leadId, platform: "xhs" },
        });
      }
      // 防御：从真机抓取的消息时间可能缺失/非法（如空串），new Date 会得到 Invalid Date 让 Prisma 报错。
      const parsedSentAt = new Date(input.sentAt);
      const sentAt = Number.isNaN(parsedSentAt.getTime()) ? new Date() : parsedSentAt;
      const row = await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          from: input.direction === "outbound" ? "agent" : "customer",
          content: input.content,
          sentAt,
        },
      });
      // Update lastMessageAt
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: sentAt },
      });
      return {
        id: row.id,
        direction: row.from === "agent" ? "outbound" : "inbound",
        content: row.content,
        sentAt: row.sentAt.toISOString(),
      };
    },

    async listConversationMessages(leadId) {
      const conversation = await prisma.conversation.findUnique({ where: { leadId } });
      if (!conversation) return [];
      const rows = await prisma.conversationMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { sentAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.id,
        direction: r.from === "agent" ? "outbound" : "inbound",
        content: r.content,
        sentAt: r.sentAt.toISOString(),
      }));
    },

    // ── Profiles ───────────────────────────────────────────────────

    async upsertProfile(input) {
      const existing = await prisma.leadProfile.findUnique({ where: { leadId: input.leadId } });
      const merged = {
        summary: input.summary || existing?.summary || "",
        sourceNote: input.sourceNote ?? existing?.sourceNote ?? null,
        needs: input.needs.length ? input.needs : (existing?.needs ?? []),
        concerns: input.concerns.length ? input.concerns : (existing?.concerns ?? []),
        fields: {
          ...((existing?.fields as Record<string, unknown>) ?? {}),
          ...input.fields,
        } as Prisma.InputJsonValue,
      };
      const row = await prisma.leadProfile.upsert({
        where: { leadId: input.leadId },
        create: {
          leadId: input.leadId,
          ...merged,
        },
        update: merged,
      });
      return {
        leadId: row.leadId,
        summary: row.summary,
        sourceNote: row.sourceNote ?? undefined,
        needs: row.needs,
        concerns: row.concerns,
        fields: row.fields as Record<string, { label: string; value: string; confidence?: number }>,
      };
    },

    async getProfile(leadId) {
      const row = await prisma.leadProfile.findUnique({ where: { leadId } });
      if (!row) return undefined;
      return {
        leadId: row.leadId,
        summary: row.summary,
        sourceNote: row.sourceNote ?? undefined,
        needs: row.needs,
        concerns: row.concerns,
        fields: row.fields as Record<string, { label: string; value: string; confidence?: number }>,
      };
    },

    // ── Next followup ──────────────────────────────────────────────

    async upsertNextFollowup(input) {
      await prisma.nextFollowup.upsert({
        where: { leadId: input.leadId },
        create: {
          leadId: input.leadId,
          message: input.message,
          usedMemoryRefs: input.usedMemoryRefs,
          worker: input.worker ?? null,
          nextBestAction: input.nextBestAction ?? null,
          requiresHumanApproval: input.requiresHumanApproval ?? false,
        },
        update: {
          message: input.message,
          usedMemoryRefs: input.usedMemoryRefs,
          worker: input.worker ?? null,
          nextBestAction: input.nextBestAction ?? null,
          requiresHumanApproval: input.requiresHumanApproval ?? false,
        },
      });
      return input;
    },

    async getNextFollowup(leadId) {
      const row = await prisma.nextFollowup.findUnique({ where: { leadId } });
      if (!row) return undefined;
      return {
        leadId: row.leadId,
        message: row.message,
        usedMemoryRefs: row.usedMemoryRefs,
        worker: row.worker ?? undefined,
        nextBestAction: row.nextBestAction ?? undefined,
        requiresHumanApproval: row.requiresHumanApproval,
      };
    },

    // ── Social identity ────────────────────────────────────────────

    async upsertSocialIdentity(input) {
      await prisma.socialIdentity.upsert({
        where: { leadId: input.leadId },
        create: {
          leadId: input.leadId,
          platform: input.platform,
          externalUserId: input.externalUserId,
          redId: input.redId ?? null,
          username: input.username ?? "",
        },
        update: {
          platform: input.platform,
          externalUserId: input.externalUserId,
          redId: input.redId ?? null,
          username: input.username ?? "",
        },
      });
    },

    async getSocialIdentity(leadId) {
      const row = await prisma.socialIdentity.findUnique({ where: { leadId } });
      if (!row) return undefined;
      return {
        leadId: row.leadId,
        platform: row.platform,
        externalUserId: row.externalUserId,
        redId: row.redId ?? undefined,
        username: row.username || undefined,
      };
    },

    // ── Workflow runs ──────────────────────────────────────────────

    async createWorkflowRun(input) {
      const row = await prisma.workflowRun.create({
        data: {
          type: input.type,
          status: "running",
          campaignId: input.campaignId ?? null,
          leadId: input.leadId ?? null,
          metadata: input.metadata ?? undefined,
          startedAt: new Date(),
        },
      });
      return { id: row.id, status: row.status };
    },

    async updateWorkflowRun(id, data) {
      await prisma.workflowRun.update({
        where: { id },
        data: {
          status: data.status as never ?? undefined,
          completedAt: data.completedAt ?? undefined,
          errorMessage: data.errorMessage ?? undefined,
          metadata: data.metadata ?? undefined,
        },
      });
    },

    async listWorkflowRuns(campaignId) {
      const rows = await prisma.workflowRun.findMany({
        where: campaignId ? { campaignId } : undefined,
        orderBy: { startedAt: "desc" },
      });
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        errorMessage: r.errorMessage,
        metadata: r.metadata,
        campaignId: r.campaignId,
      }));
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function campaignToRecord(c: Record<string, unknown>): Record<string, unknown> {
  return { ...c };
}

function leadFromPrisma(row: Record<string, unknown>): StoredLead {
  return {
    id: row.id as string,
    campaignId: row.campaignId as string,
    platform: row.platform as string,
    status: row.status as string,
    memorySpaceId: (row.memorySpaceId as string) ?? "",
    displayName: (row.displayName as string) ?? "",
    intentLevel: (row.intentLevel as string) ?? undefined,
    summary: undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt as string | number | Date).toISOString() : undefined,
    isDemoSeed: (row.isDemoSeed as boolean) ?? false,
    autoFollowupEnabled: (row.autoFollowupEnabled as boolean) ?? false,
    nextActionAt: (row.nextActionAt as Date | null) ?? null,
    followupTouchCount: (row.followupTouchCount as number) ?? 0,
  };
}

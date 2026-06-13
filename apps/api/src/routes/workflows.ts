import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const CampaignDiscoveryBodySchema = z.object({
  campaignId: z.string(),
  seedKeywords: z.array(z.string()).min(1).optional(),
  maxPostsPerRun: z.number().int().positive().max(50).optional(),
  maxCommentsPerPost: z.number().int().positive().max(100).optional(),
});

const SingleSourceDiscoveryBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  sourceText: z.string().min(1),
  campaignId: z.string().optional(),
  displayName: z.string().optional(),
});

const DiscoveryBodySchema = z.union([
  CampaignDiscoveryBodySchema,
  SingleSourceDiscoveryBodySchema,
]);

const ConversionBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  customerMessage: z.string().min(1),
});

const HandoffBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  fromWorkerId: z.string(),
  toWorkerId: z.string(),
});

export function workflowsRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/discovery/run", async (c) => {
    const body = DiscoveryBodySchema.parse(await c.req.json());

    // Campaign 模式：有 campaignId 且没有 sourceText
    if ("campaignId" in body && !("sourceText" in body)) {
      const { runCampaignDiscoveryWorkflow } = await import("@leadflow/agents");
      const campaign = services.store.campaigns.get(body.campaignId);
      const seedKeywords = body.seedKeywords ?? (campaign as { seedKeywords?: string[] })?.seedKeywords ?? [body.campaignId];
      const workflowServices = {
        llm: services.llm,
        memwal: services.memwal,
        walrus: services.walrus,
        xhsDiscovery: services.xhsDiscovery,
      };
      const result = await runCampaignDiscoveryWorkflow(
        workflowServices,
        {
          campaignId: body.campaignId,
          seedKeywords,
          maxPostsPerRun: body.maxPostsPerRun,
          maxCommentsPerPost: body.maxCommentsPerPost,
          delayMs: Number(process.env.XHS_DISCOVERY_DELAY_MS ?? 2000),
        },
      );
      return c.json(result);
    }

    // 单源模式：有 sourceText（兜底）
    const singleBody = body as z.infer<typeof SingleSourceDiscoveryBodySchema>;
    const result = await services.workflows.runDiscovery(singleBody);

    services.store.upsertLead({
      id: singleBody.leadId,
      campaignId: singleBody.campaignId ?? "manual",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: singleBody.memorySpaceId,
      displayName: singleBody.displayName ?? singleBody.leadId,
      summary: result.summary,
      intentLevel: result.intentLevel,
    });
    const memoryRef = services.store.appendMemoryRef({
      leadId: singleBody.leadId,
      memoryId: result.memoryRef ?? "",
      kind: "source_evidence",
      summary: result.summary ?? "",
      sourceArtifactBlobId: result.artifact?.blobId,
    });
    const artifactRef = services.store.appendArtifactRef({
      leadId: singleBody.leadId,
      artifactType: result.artifact?.type ?? "lead_discovery_report",
      blobId: result.artifact?.blobId ?? "",
    });
    // artifactRefs 存 Walrus blobId（外部寻址），memoryRefs 存 store 内部 id（本地追踪）
    services.store.appendTimelineEvent({
      leadId: singleBody.leadId,
      type: "lead_discovered",
      summary: result.summary ?? "Discovery workflow completed",
      agentName: "discovery",
      memoryRefs: [memoryRef.id],
      artifactRefs: [artifactRef.blobId],
    });

    return c.json(result);
  });

  route.post("/conversion/run", async (c) => {
    const body = ConversionBodySchema.parse(await c.req.json());
    const result = await services.workflows.runConversion(body);

    const memoryRef = services.store.appendMemoryRef({
      leadId: body.leadId,
      memoryId: result.memoryRef ?? "",
      kind: "customer_reply",
      summary: body.customerMessage.slice(0, 100),
      sourceArtifactBlobId: result.artifact?.blobId,
    });
    const artifactRef = services.store.appendArtifactRef({
      leadId: body.leadId,
      artifactType: result.artifact?.type ?? "conversion_decision",
      blobId: result.artifact?.blobId ?? "",
    });
    // artifactRefs 存 Walrus blobId（外部寻址），memoryRefs 存 store 内部 id（本地追踪）
    services.store.appendTimelineEvent({
      leadId: body.leadId,
      type: "conversion_decision_made",
      summary: `生成跟进消息：${result.message?.slice(0, 50) ?? ""}`,
      agentName: "conversion",
      memoryRefs: [memoryRef.id],
      artifactRefs: [artifactRef.blobId],
    });

    // conversion 仅更新 lead 状态，不覆盖 discovery 阶段的 campaignId 和 displayName
    const existingLead = services.store.getLead(body.leadId);
    if (existingLead) {
      services.store.upsertLead({ ...existingLead, status: "nurturing" });
    }

    return c.json(result);
  });

  route.post("/handoff/run", async (c) => {
    const body = HandoffBodySchema.parse(await c.req.json());
    const result = await services.workflows.runHandoffRecovery(body);

    const artifactRef = services.store.appendArtifactRef({
      leadId: body.leadId,
      artifactType: "handoff_proof",
      blobId: result.artifact?.blobId ?? "",
    });
    // handoff 不变更 lead 状态，仅记录移交事件
    services.store.appendTimelineEvent({
      leadId: body.leadId,
      type: "handoff_recovered",
      summary: result.recoverySummary ?? "Handoff completed",
      agentName: "handoff",
      workerId: body.toWorkerId,
      memoryRefs: [],
      artifactRefs: [artifactRef.blobId],
    });

    return c.json(result);
  });

  return route;
}

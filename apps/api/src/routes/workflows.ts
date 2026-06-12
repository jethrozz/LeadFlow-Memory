import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const DiscoveryBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  sourceText: z.string().min(1),
  campaignId: z.string().optional(),
  displayName: z.string().optional(),
});

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
    const result = await services.workflows.runDiscovery(body);

    services.store.upsertLead({
      id: body.leadId,
      campaignId: body.campaignId ?? "manual",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: body.memorySpaceId,
      displayName: body.displayName ?? body.leadId,
      summary: result.summary,
      intentLevel: result.intentLevel,
    });
    const memoryRef = services.store.appendMemoryRef({
      leadId: body.leadId,
      memoryId: result.memoryRef ?? "",
      kind: "source_evidence",
      summary: result.summary ?? "",
      sourceArtifactBlobId: result.artifact?.blobId,
    });
    const artifactRef = services.store.appendArtifactRef({
      leadId: body.leadId,
      artifactType: result.artifact?.type ?? "lead_discovery_report",
      blobId: result.artifact?.blobId ?? "",
    });
    services.store.appendTimelineEvent({
      leadId: body.leadId,
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
    services.store.appendTimelineEvent({
      leadId: body.leadId,
      type: "conversion_decision_made",
      summary: `生成跟进消息：${result.message?.slice(0, 50) ?? ""}`,
      agentName: "conversion",
      memoryRefs: [memoryRef.id],
      artifactRefs: [artifactRef.blobId],
    });
    services.store.upsertLead({
      id: body.leadId,
      campaignId: "manual",
      platform: "xhs",
      status: "nurturing",
      memorySpaceId: body.memorySpaceId,
      displayName: body.leadId,
    });

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

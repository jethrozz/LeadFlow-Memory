import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { createArtifactPayload } from "@leadflow/walrus";
import type { ApiServices } from "../app.js";
import type { StoredLead } from "../store.js";

function toLeadListItem(lead: StoredLead) {
  return {
    id: lead.id,
    displayName: lead.displayName,
    platform: lead.platform,
    status: lead.status,
    intentLevel: lead.intentLevel,
    summary: lead.summary,
    updatedAt: lead.updatedAt,
    isDemoSeed: lead.isDemoSeed ?? false,
  };
}

export function leadsRoutes(services: ApiServices) {
  const route = new Hono();

  route.get("/", async (c) => {
    const leads = await services.store.listLeads();
    const items = leads.map(toLeadListItem);
    return c.json({ items });
  });

  route.get("/:leadId", async (c) => {
    const leadId = c.req.param("leadId");
    const lead = await services.store.getLead(leadId);
    if (!lead) {
      return c.json({ error: { code: "LEAD_NOT_FOUND" } }, 404);
    }
    return c.json({ lead });
  });

  // 手动新增模拟线索（方便测试）
  const MockLeadBodySchema = z.object({
    displayName: z.string().min(1),         // 小红书昵称
    redId: z.string().min(1),               // 小红书号（必填）
    platform: z.string().default("xhs"),
    summary: z.string().default(""),
    intentLevel: z.string().default("A"),
    sourceText: z.string().optional(),
    campaignId: z.string().default("manual"),
    fields: z.record(z.string()).optional(),
    needs: z.array(z.string()).optional(),
    concerns: z.array(z.string()).optional(),
  });

  route.post("/mock", async (c) => {
    const body = MockLeadBodySchema.parse(await c.req.json());
    const leadId = `lead_mock_${randomUUID().slice(0, 8)}`;
    const memorySpaceId = `space_${leadId}`;

    // 0. 确保兜底 campaign 存在（Lead.campaignId 是外键，mock 默认挂在 "manual" 下）
    const existingCampaign = await services.store.getCampaign(body.campaignId);
    if (!existingCampaign) {
      await services.store.upsertCampaign({
        id: body.campaignId,
        name: body.campaignId === "manual" ? "手动测试" : body.campaignId,
        status: "draft",
      });
    }

    // 1. 写入 lead
    await services.store.upsertLead({
      id: leadId,
      campaignId: body.campaignId,
      platform: body.platform,
      status: "discovered",
      memorySpaceId,
      displayName: body.displayName,
      summary: body.summary,
      intentLevel: body.intentLevel,
    });

    // 2. 写入 profile
    const profileFields: Record<string, { label: string; value: string }> = {};
    if (body.fields) {
      for (const [key, value] of Object.entries(body.fields)) {
        profileFields[key] = { label: key, value };
      }
    }
    await services.store.upsertProfile({
      leadId,
      summary: body.summary,
      sourceNote: body.sourceText,
      needs: body.needs ?? [],
      concerns: body.concerns ?? [],
      fields: profileFields,
    });

    // 3. 写入 MemWal 语义记忆
    let memoryRefId = "";
    try {
      const memory = await services.memwal.writeMemory({
        leadId,
        memorySpaceId,
        content: body.sourceText ?? body.summary,
        metadata: { source: "manual", confidence: 0.9, artifactRefs: [] },
      });
      memoryRefId = memory.id;
    } catch (err) {
      console.warn("[leads/mock] MemWal write failed:", err instanceof Error ? err.message : err);
    }

    // 4. 存储 Walrus artifact
    let artifactBlobId = "";
    try {
      const artifact = await services.walrus.store(
        createArtifactPayload({
          leadId,
          type: "source_snapshot",
          data: {
            sourceText: body.sourceText ?? body.summary,
            // 身份信息一并留档，便于造数据测试转化 agent / 从 blob 溯源用户
            author: {
              platform: body.platform,
              redId: body.redId,
              displayName: body.displayName,
            },
            createdAt: new Date().toISOString(),
          },
        }),
      );
      artifactBlobId = artifact.blobId;
    } catch (err) {
      console.warn("[leads/mock] Walrus store failed:", err instanceof Error ? err.message : err);
    }

    // 5. 写入 memory ref 和 artifact ref
    const memoryRef = await services.store.appendMemoryRef({
      leadId,
      memoryId: memoryRefId,
      kind: "source_evidence",
      summary: body.summary,
      sourceArtifactBlobId: artifactBlobId,
    });
    if (artifactBlobId) {
      await services.store.appendArtifactRef({
        leadId,
        artifactType: "source_snapshot",
        blobId: artifactBlobId,
      });
    }

    // 6. timeline event
    await services.store.appendTimelineEvent({
      leadId,
      type: "lead_discovered",
      summary: body.summary,
      agentName: "manual_mock",
      memoryRefs: memoryRefId ? [memoryRef.id] : [],
      artifactRefs: artifactBlobId ? [artifactBlobId] : [],
    });

    // 7. 小红书身份绑定（必填）。手动录入只有小红书号，没有 user_id：
    //    redId 字段存小红书号，externalUserId 以 redId 兜底。
    await services.store.upsertSocialIdentity({
      leadId,
      platform: "xhs",
      externalUserId: body.redId,
      redId: body.redId,
      username: body.displayName,
    });

    return c.json({ leadId, displayName: body.displayName, redId: body.redId, memorySpaceId, memoryRefId, artifactBlobId });
  });

  // 把指定线索加入自动跟进流水线，交给定时循环接管（不在此同步执行）。
  // 仅置 autoFollowupEnabled=true, nextActionAt=now，立即返回；
  // 后台 followup-loop（AUTO_FOLLOWUP_ENABLED=true）下一个 tick 会捞到它并自动跟进。
  route.post("/:leadId/start-followup", async (c) => {
    const leadId = c.req.param("leadId");
    const lead = await services.store.getLead(leadId);
    if (!lead) {
      return c.json({ error: { code: "LEAD_NOT_FOUND" } }, 404);
    }

    await services.store.updateLeadFollowupState(leadId, {
      autoFollowupEnabled: true,
      nextActionAt: new Date(),
    });

    return c.json({
      leadId,
      enqueued: true,
      status: lead.status,
      note: "已加入自动跟进，由定时循环接管",
    });
  });

  // 模拟 worker 崩溃：把线索租约置过期 + 假 workerId，让真 worker 下一 tick 认领并触发 handoff。
  route.post("/:leadId/simulate-crash", async (c) => {
    const leadId = c.req.param("leadId");
    const lead = await services.store.getLead(leadId);
    if (!lead) {
      return c.json({ error: { code: "LEAD_NOT_FOUND" } }, 404);
    }
    if (lead.status !== "contacting") {
      return c.json(
        { error: { code: "NOT_CONTACTING", message: "仅 contacting(进行中对话) 的线索可模拟接管" } },
        400,
      );
    }
    // 关键：除了置假 workerId + 过期租约，还要确保线索可被 claimDueLeads 认领
    // （autoFollowupEnabled=true 且 nextActionAt<=now），否则真 worker 永不接管、handoff 不触发。
    await services.store.updateLeadFollowupState(leadId, {
      workerId: "worker_crashed_demo",
      leaseExpiresAt: new Date(Date.now() - 1000),
      autoFollowupEnabled: true,
      nextActionAt: new Date(Date.now() - 1000),
    });
    const after = await services.store.getLead(leadId);
    return c.json({ leadId, simulated: true, status: after?.status, workerId: after?.workerId });
  });

  return route;
}

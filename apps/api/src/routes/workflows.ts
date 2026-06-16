import { resolve } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import type { ConversionPlaybook } from "@leadflow/playbook";
import type { ApiServices } from "../app.js";
import type { StoredProfileField } from "../store.js";

const PLAYBOOKS_DIR = resolve(import.meta.dirname, "../../../playbooks");

async function loadPlaybook(playbookId?: string): Promise<ConversionPlaybook | undefined> {
  if (!playbookId) return undefined;
  try {
    const { loadPlaybookFromFile } = await import("@leadflow/playbook");
    return await loadPlaybookFromFile(resolve(PLAYBOOKS_DIR, `${playbookId}.yml`));
  } catch {
    return undefined;
  }
}

// 中文标签映射：用于把 LLM 抽取的英文字段键渲染成画像面板里的标签。
const FIELD_LABELS: Record<string, string> = {
  budget: "预算",
  district: "区域",
  layout: "户型",
  property_market: "市场类型",
  property_condition: "房屋状况",
  viewing_time: "看房时间",
};

function toProfileFields(extracted: Record<string, unknown>): Record<string, StoredProfileField> {
  const fields: Record<string, StoredProfileField> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (value == null || value === "") continue;
    fields[key] = { label: FIELD_LABELS[key] ?? key, value: String(value) };
  }
  return fields;
}

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
      const campaign = await services.store.getCampaign(body.campaignId);
      const seedKeywords = body.seedKeywords ?? (campaign as { seedKeywords?: string[] })?.seedKeywords ?? [body.campaignId];
      const targetLeadCount = (campaign as { targetLeadCount?: number })?.targetLeadCount ?? 10;
      const playbook = await loadPlaybook((campaign as { playbookId?: string })?.playbookId);

      // 创建 WorkflowRun 记录
      const workflowRun = await services.store.createWorkflowRun({
        type: "discovery",
        campaignId: body.campaignId,
        metadata: { searched: 0, relevant: 0, leadsCreated: 0, skipped: 0 },
      });

      // 收集已有线索的 externalId，用于跨运行去重
      const existingLeads = await services.store.listLeads();
      const existingExternalIds = new Set<string>();
      for (const lead of existingLeads) {
        // leadId 格式: lead_xhs_{externalId} 或 lead_xhs_comment_{externalId}
        const match = lead.id.match(/^lead_xhs_(?:comment_)?(.+)$/);
        if (match) existingExternalIds.add(match[1]);
      }

      const workflowServices = {
        llm: services.llm,
        memwal: services.memwal,
        walrus: services.walrus,
        xhsDiscovery: services.xhsDiscovery,
      };

      let result: Awaited<ReturnType<typeof runCampaignDiscoveryWorkflow>>;
      try {
        result = await runCampaignDiscoveryWorkflow(
          workflowServices,
          {
            campaignId: body.campaignId,
            seedKeywords,
            maxPostsPerRun: body.maxPostsPerRun,
            maxCommentsPerPost: body.maxCommentsPerPost,
            delayMs: Number(process.env.XHS_DISCOVERY_DELAY_MS ?? 2000),
            targetLeadCount,
            existingLeadExternalIds: existingExternalIds,
            playbook,
            onProgress: async (progress) => {
              await services.store.updateWorkflowRun(workflowRun.id, {
                metadata: progress,
              }).catch(() => {}); // 静默失败，不阻塞主流程
            },
          },
        );

        // 标记运行成功
        await services.store.updateWorkflowRun(workflowRun.id, {
          status: "succeeded",
          completedAt: new Date(),
          metadata: {
            searched: result.searched,
            relevant: result.relevant,
            leadsCreated: result.leadsCreated,
            skipped: result.skipped,
          },
        });
      } catch (err) {
        // 标记运行失败
        await services.store.updateWorkflowRun(workflowRun.id, {
          status: "failed",
          completedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
        }).catch(() => {});
        throw err;
      }

      // 把 campaign 发现的每条线索写入 store，使其出现在 Dashboard。
      for (const lead of result.leads) {
        await services.store.upsertLead({
          id: lead.leadId,
          campaignId: body.campaignId,
          platform: lead.platform,
          status: "discovered",
          memorySpaceId: lead.memorySpaceId,
          displayName: lead.displayName,
          summary: lead.summary,
          intentLevel: lead.intentLevel,
          autoFollowupEnabled: true,
          nextActionAt: new Date(),
        });
        await services.store.upsertProfile({
          leadId: lead.leadId,
          summary: lead.summary,
          sourceNote: lead.sourceText,
          needs: lead.needs,
          concerns: lead.concerns,
          fields: toProfileFields(lead.extractedFields),
        });
        const memoryRef = await services.store.appendMemoryRef({
          leadId: lead.leadId,
          memoryId: lead.memoryRef,
          kind: "source_evidence",
          summary: lead.summary,
          sourceArtifactBlobId: lead.sourceArtifactBlobId,
        });
        await services.store.appendArtifactRef({
          leadId: lead.leadId,
          artifactType: "source_snapshot",
          blobId: lead.sourceArtifactBlobId,
        });
        await services.store.appendArtifactRef({
          leadId: lead.leadId,
          artifactType: "lead_discovery_report",
          blobId: lead.reportArtifactBlobId,
        });
        await services.store.appendTimelineEvent({
          leadId: lead.leadId,
          type: "lead_discovered",
          summary: lead.summary,
          agentName: "Discovery Agent",
          memoryRefs: [memoryRef.id],
          artifactRefs: [lead.sourceArtifactBlobId],
        });

        // 存储小红书用户身份：externalUserId 存 user_id（一定有），redId 存小红书号
        // （供 mcp-xhs-chat adb 搜索用户），两者区分存储，互不覆盖。
        if (lead.authorUserId || lead.authorRedId) {
          await services.store.upsertSocialIdentity({
            leadId: lead.leadId,
            platform: "xhs",
            externalUserId: lead.authorUserId ?? lead.authorRedId!,
            redId: lead.authorRedId,
            username: lead.displayName,
          });
        }
      }

      return c.json({ ...result, workflowRunId: workflowRun.id });
    }

    // 单源模式：有 sourceText（兜底）
    const singleBody = body as z.infer<typeof SingleSourceDiscoveryBodySchema>;
    const result = await services.workflows.runDiscovery(singleBody);

    await services.store.upsertLead({
      id: singleBody.leadId,
      campaignId: singleBody.campaignId ?? "manual",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: singleBody.memorySpaceId,
      displayName: singleBody.displayName ?? singleBody.leadId,
      summary: result.summary,
      intentLevel: result.intentLevel,
    });
    const discoveryFields = toProfileFields(result.extractedFields);
    await services.store.upsertProfile({
      leadId: singleBody.leadId,
      summary: result.summary ?? "",
      sourceNote: singleBody.sourceText,
      needs: Object.entries(result.extractedFields)
        .filter(([key, value]) => key !== "budget" && value != null && value !== "")
        .map(([, value]) => String(value)),
      concerns: [],
      fields: discoveryFields,
    });
    const memoryRef = await services.store.appendMemoryRef({
      leadId: singleBody.leadId,
      memoryId: result.memoryRef ?? "",
      kind: "source_evidence",
      summary: result.summary ?? "",
      sourceArtifactBlobId: result.artifact?.blobId,
    });
    const artifactRef = await services.store.appendArtifactRef({
      leadId: singleBody.leadId,
      artifactType: result.artifact?.type ?? "lead_discovery_report",
      blobId: result.artifact?.blobId ?? "",
    });
    await services.store.appendTimelineEvent({
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

    const memoryRef = await services.store.appendMemoryRef({
      leadId: body.leadId,
      memoryId: result.memoryRef ?? "",
      kind: "customer_reply",
      summary: body.customerMessage.slice(0, 100),
      sourceArtifactBlobId: result.artifact?.blobId,
    });
    const artifactRef = await services.store.appendArtifactRef({
      leadId: body.leadId,
      artifactType: result.artifact?.type ?? "conversion_decision",
      blobId: result.artifact?.blobId ?? "",
    });
    await services.store.appendTimelineEvent({
      leadId: body.leadId,
      type: "conversion_decision_made",
      summary: `生成跟进消息：${result.message?.slice(0, 50) ?? ""}`,
      agentName: "conversion",
      memoryRefs: [memoryRef.id],
      artifactRefs: [artifactRef.blobId],
    });

    // conversion 仅更新 lead 状态，不覆盖 discovery 阶段的 campaignId 和 displayName
    const existingLead = await services.store.getLead(body.leadId);
    if (existingLead) {
      await services.store.upsertLead({ ...existingLead, status: "nurturing" });
    }

    // 持久化 Agent 生成的下一步话术，供 Dashboard 的「下一步最佳跟进」面板展示
    await services.store.upsertNextFollowup({
      leadId: body.leadId,
      message: result.message ?? "",
      usedMemoryRefs: [memoryRef.id],
      requiresHumanApproval: true,
    });
    // conversion 也可能抽取到新的画像字段，合并进已有 profile
    if (Object.keys(result.extractedFields).length > 0) {
      await services.store.upsertProfile({
        leadId: body.leadId,
        summary: existingLead?.summary ?? "",
        needs: [],
        concerns: [],
        fields: toProfileFields(result.extractedFields),
      });
    }

    return c.json(result);
  });

  route.post("/handoff/run", async (c) => {
    const body = HandoffBodySchema.parse(await c.req.json());
    const result = await services.workflows.runHandoffRecovery(body);

    const artifactRef = await services.store.appendArtifactRef({
      leadId: body.leadId,
      artifactType: "handoff_proof",
      blobId: result.artifact?.blobId ?? "",
    });
    // handoff 不变更 lead 状态，仅记录移交事件
    await services.store.appendTimelineEvent({
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

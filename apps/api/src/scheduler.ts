import { resolve } from "node:path";
import type { ConversionPlaybook } from "@leadflow/playbook";
import type { ApiServices } from "./app.js";

const PLAYBOOKS_DIR = resolve(import.meta.dirname, "../../../playbooks");

async function loadPlaybookForCampaign(campaign: Record<string, unknown>): Promise<ConversionPlaybook | undefined> {
  const playbookId = campaign.playbookId as string | undefined;
  if (!playbookId) return undefined;
  try {
    const { loadPlaybookFromFile } = await import("@leadflow/playbook");
    return await loadPlaybookFromFile(resolve(PLAYBOOKS_DIR, `${playbookId}.yml`));
  } catch {
    console.warn(`[scheduler] Playbook '${playbookId}' not found, using default prompt`);
    return undefined;
  }
}

/**
 * 进程内定时调度器。
 * 每分钟检查一次 active campaigns 的 scheduleTimes，到了就触发后台发现。
 * 不阻塞请求处理——发现任务在 fire-and-forget 的异步上下文中运行。
 */
export function startScheduler(services: ApiServices): { stop: () => void } {
  let running = true;
  let lastTriggeredMinute = ""; // 防止同一分钟重复触发

  const tick = async () => {
    if (!running) return;

    const now = new Date();
    // 本地时间 HH:MM
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // 同一分钟只触发一次
    if (currentTime === lastTriggeredMinute) return;
    lastTriggeredMinute = currentTime;

    try {
      const campaigns = await services.store.listCampaigns();
      for (const campaign of campaigns) {
        if (
          campaign.status === "active" &&
          campaign.scheduleEnabled === true &&
          Array.isArray(campaign.scheduleTimes) &&
          (campaign.scheduleTimes as string[]).includes(currentTime)
        ) {
          triggerCampaignDiscovery(services, campaign).catch((err) => {
            console.error(
              `[scheduler] Campaign ${campaign.id} discovery failed:`,
              err instanceof Error ? err.message : err,
            );
          });
        }
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err instanceof Error ? err.message : err);
    }
  };

  // 每分钟跑一次
  const interval = setInterval(tick, 60_000);

  return {
    stop() {
      running = false;
      clearInterval(interval);
    },
  };
}

/**
 * 触发指定 campaign 的发现流程。
 * 外部调用方传入 workflowRunId 则复用已有记录，否则自动创建。
 * 供调度器（自动）和 POST /api/campaigns/:id/run（手动调试）共用。
 */
export async function triggerCampaignDiscovery(
  services: ApiServices,
  campaign: Record<string, unknown>,
  existingRunId?: string,
): Promise<void> {
  const campaignId = campaign.id as string;
  const seedKeywords = (campaign.seedKeywords as string[]) ?? [campaignId];
  const targetLeadCount = (campaign.targetLeadCount as number) ?? 10;
  const maxPostsPerRun = (campaign.maxPostsPerRun as number) ?? 20;
  const maxCommentsPerPost = (campaign.maxCommentsPerPost as number) ?? 50;
  const triggeredBy = existingRunId ? "manual" : "scheduler";

  const playbook = await loadPlaybookForCampaign(campaign);
  console.log(`[${triggeredBy}] Triggering discovery for campaign ${campaignId}${playbook ? ` (playbook: ${playbook.id})` : ""}`);

  // 复用已有 WorkflowRun 或创建新的
  const workflowRunId = existingRunId ?? (await services.store.createWorkflowRun({
    type: "discovery",
    campaignId,
    metadata: { triggeredBy, searched: 0, relevant: 0, leadsCreated: 0, skipped: 0 },
  })).id;

  // 收集已有线索 externalId 去重
  const existingLeads = await services.store.listLeads();
  const existingExternalIds = new Set<string>();
  for (const lead of existingLeads) {
    const match = lead.id.match(/^lead_xhs_(?:comment_)?(.+)$/);
    if (match) existingExternalIds.add(match[1]);
  }

  try {
    const { runCampaignDiscoveryWorkflow } = await import("@leadflow/agents");
    const result = await runCampaignDiscoveryWorkflow(
      {
        llm: services.llm,
        memwal: services.memwal,
        walrus: services.walrus,
        xhsDiscovery: services.xhsDiscovery,
      },
      {
        campaignId,
        seedKeywords,
        maxPostsPerRun,
        maxCommentsPerPost,
        delayMs: Number(process.env.XHS_DISCOVERY_DELAY_MS ?? 2000),
        targetLeadCount,
        existingLeadExternalIds: existingExternalIds,
        playbook,
        onProgress: async (progress) => {
          await services.store.updateWorkflowRun(workflowRunId, {
            metadata: { triggeredBy, ...progress },
          }).catch(() => {});
        },
      },
    );

    // 写入发现的线索
    for (const lead of result.leads) {
      await services.store.upsertLead({
        id: lead.leadId,
        campaignId,
        platform: lead.platform,
        status: "discovered",
        memorySpaceId: lead.memorySpaceId,
        displayName: lead.displayName,
        summary: lead.summary,
        intentLevel: lead.intentLevel,
      });
      await services.store.upsertProfile({
        leadId: lead.leadId,
        summary: lead.summary,
        sourceNote: lead.sourceText,
        needs: lead.needs,
        concerns: lead.concerns,
        fields: Object.fromEntries(
          Object.entries(lead.extractedFields)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => [k, { label: k, value: String(v) }]),
        ),
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
        agentName: `Discovery Agent (${triggeredBy})`,
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

    await services.store.updateWorkflowRun(workflowRunId, {
      status: "succeeded",
      completedAt: new Date(),
      metadata: {
        triggeredBy,
        searched: result.searched,
        relevant: result.relevant,
        leadsCreated: result.leadsCreated,
        skipped: result.skipped,
      },
    });

    console.log(
      `[${triggeredBy}] Campaign ${campaignId} discovery completed: ${result.leadsCreated} leads found`,
    );
  } catch (err) {
    await services.store.updateWorkflowRun(workflowRunId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    console.error(
      `[${triggeredBy}] Campaign ${campaignId} discovery failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

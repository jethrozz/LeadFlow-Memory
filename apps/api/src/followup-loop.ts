import type { ApiServices } from "./app.js";
import type { StoredLead } from "./store.js";
import { decideNextAction } from "./followup-decision.js";
import { loadPlaybookForCampaign } from "./playbook-loader.js";
import { sendFollowup, syncConversation } from "./conversation-service.js";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";

const WORKER_ID = `worker_${hostname()}_${process.pid}_${randomBytes(2).toString("hex")}`;

export type FollowupConfig = {
  intervalMs: number;
  maxTouches: number;
  deviceId?: string;
  workerId: string;
  leaseMs: number;
};

export type ProcessResult = { sent: boolean; skippedReason?: string };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

/** 从 env 读单条处理用的配置（路由手动触发与循环共用）。 */
export function readFollowupConfig(): FollowupConfig {
  return {
    intervalMs: num(process.env.AUTO_FOLLOWUP_INTERVAL_MS, 60_000),
    maxTouches: num(process.env.AUTO_FOLLOWUP_MAX_TOUCHES, 8),
    deviceId: process.env.AUTO_FOLLOWUP_DEVICE_ID || undefined,
    workerId: WORKER_ID,
    leaseMs: num(process.env.AUTO_FOLLOWUP_LEASE_MS, 90_000),
  };
}

function readConfig(): {
  enabled: boolean;
  tickMs: number;
  batchSize: number;
  sendMinMs: number;
  sendMaxMs: number;
  dailyCap: number;
  cfg: FollowupConfig;
} {
  return {
    enabled: process.env.AUTO_FOLLOWUP_ENABLED === "true",
    tickMs: num(process.env.AUTO_FOLLOWUP_INTERVAL_MS, 60_000),
    batchSize: num(process.env.AUTO_FOLLOWUP_BATCH_SIZE, 10),
    sendMinMs: num(process.env.AUTO_FOLLOWUP_SEND_MIN_MS, 3000),
    sendMaxMs: num(process.env.AUTO_FOLLOWUP_SEND_MAX_MS, 8000),
    dailyCap: num(process.env.AUTO_FOLLOWUP_DAILY_CAP, 50),
    cfg: readFollowupConfig(),
  };
}

// In-process daily send counter (single-process MVP)
const dailyCounter = { date: "", count: 0 };

function bumpDaily(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyCounter.date !== today) {
    dailyCounter.date = today;
    dailyCounter.count = 0;
  }
  dailyCounter.count++;
}

function dailyCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  return dailyCounter.date === today ? dailyCounter.count : 0;
}

function leasePatch(cfg: FollowupConfig, now: Date, nextActionAt: Date | null) {
  return nextActionAt == null
    ? { workerId: null, leaseExpiresAt: null }
    : { workerId: cfg.workerId, leaseExpiresAt: new Date(now.getTime() + cfg.leaseMs) };
}

export async function processLead(
  services: ApiServices,
  lead: StoredLead,
  cfg: FollowupConfig,
  now: Date,
  prevWorkerId: string | null = null,
): Promise<ProcessResult> {
  const backoff = () =>
    services.store.updateLeadFollowupState(lead.id, {
      nextActionAt: new Date(now.getTime() + cfg.intervalMs),
      ...leasePatch(cfg, now, new Date(now.getTime() + cfg.intervalMs)),
    });

  // Resolve identity
  const identity = await services.store.getSocialIdentity(lead.id);
  const xhsUserId = identity?.redId ?? undefined;
  if (!xhsUserId) {
    console.warn(`[followup] lead ${lead.id} 缺 redId，跳过`);
    await backoff();
    return { sent: false, skippedReason: "no_identity" };
  }
  // 昵称给 mcp-xhs-chat 导航/匹配聊天页用；缺则回退线索 displayName。
  const xhsUsername = identity?.username ?? lead.displayName;

  const deviceId = cfg.deviceId ?? (await services.store.getDefaultDevice())?.deviceId;
  if (!deviceId) {
    console.warn(`[followup] 无可用设备，跳过 lead ${lead.id}`);
    await backoff();
    return { sent: false, skippedReason: "no_device" };
  }

  const campaign = (await services.store.getCampaign(lead.campaignId)) ?? {};
  const playbook = await loadPlaybookForCampaign(campaign);
  console.log(
    `[followup] lead ${lead.id} 使用 playbook: ${playbook?.id ?? "(无→内置默认词)"} role=${playbook?.agent?.role ?? "-"}`,
  );

  // 接管判定：认领到的线索原属于别的 worker(且非空)、且是进行中的对话 → 跑 handoff 恢复。
  if (prevWorkerId && prevWorkerId !== cfg.workerId && lead.status === "contacting") {
    console.log(`[followup] lead ${lead.id} 接管自 ${prevWorkerId}，跑 handoff 恢复`);
    try {
      const recovery = await services.workflows.runHandoffRecovery({
        leadId: lead.id,
        memorySpaceId: lead.memorySpaceId,
        fromWorkerId: prevWorkerId,
        toWorkerId: cfg.workerId,
      });
      await services.store.appendTimelineEvent({
        leadId: lead.id,
        type: "handoff_triggered",
        summary: `worker ${prevWorkerId} → ${cfg.workerId}`,
        agentName: "handoff",
        workerId: cfg.workerId,
        memoryRefs: [],
        artifactRefs: [],
      });
      await services.store.appendTimelineEvent({
        leadId: lead.id,
        type: "handoff_recovered",
        summary: recovery.recoverySummary || "已恢复上下文",
        agentName: "handoff",
        workerId: cfg.workerId,
        memoryRefs: [],
        artifactRefs: recovery.artifact?.blobId ? [recovery.artifact.blobId] : [],
      });
    } catch (err) {
      console.warn(
        `[followup] lead ${lead.id} handoff 恢复失败，继续跟进:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // First touch (opening mode)
  if (lead.status === "discovered") {
    const conv = await services.workflows.runConversion({
      leadId: lead.id,
      memorySpaceId: lead.memorySpaceId,
      playbook,
    });
    const decision = decideNextAction({
      status: "discovered",
      hasNewInbound: false,
      outcome: null,
      touchCount: lead.followupTouchCount ?? 0,
      maxTouches: cfg.maxTouches,
      intervalMs: cfg.intervalMs,
      now,
    });
    await sendFollowup(services, { leadId: lead.id, deviceId, xhsUserId, xhsUsername, message: conv.message });
    await services.store.updateLeadFollowupState(lead.id, {
      status: decision.nextStatus,
      nextActionAt: decision.nextActionAt,
      followupTouchCount: (lead.followupTouchCount ?? 0) + 1,
      ...leasePatch(cfg, now, decision.nextActionAt),
    });
    return { sent: true };
  }

  // Poll for replies
  const { newInboundCount, lastInboundContent } = await syncConversation(services, {
    leadId: lead.id,
    deviceId,
    xhsUserId,
    xhsUsername,
  });
  console.log(
    `[followup] lead ${lead.id} 查回复：newInbound=${newInboundCount} last=${lastInboundContent ?? "-"}`,
  );

  if (!newInboundCount) {
    const decision = decideNextAction({
      status: "contacting",
      hasNewInbound: false,
      outcome: null,
      touchCount: lead.followupTouchCount ?? 0,
      maxTouches: cfg.maxTouches,
      intervalMs: cfg.intervalMs,
      now,
    });
    await services.store.updateLeadFollowupState(lead.id, {
      nextActionAt: decision.nextActionAt,
      ...leasePatch(cfg, now, decision.nextActionAt),
    });
    return { sent: false };
  }

  // Has reply — generate response and decide outcome。
  // 取最近若干轮对话原文（syncConversation 已把新回复入库），让 LLM 接得上上下文。
  const recent = (await services.store.listConversationMessages(lead.id)).slice(-10);
  const conv = await services.workflows.runConversion({
    leadId: lead.id,
    memorySpaceId: lead.memorySpaceId,
    customerMessage: lastInboundContent,
    conversationHistory: recent.map((m) => ({ direction: m.direction, content: m.content })),
    playbook,
  });
  const decision = decideNextAction({
    status: "contacting",
    hasNewInbound: true,
    outcome: conv.outcome,
    touchCount: lead.followupTouchCount ?? 0,
    maxTouches: cfg.maxTouches,
    intervalMs: cfg.intervalMs,
    now,
  });

  let sent = false;
  if (decision.shouldSend) {
    await sendFollowup(services, { leadId: lead.id, deviceId, xhsUserId, xhsUsername, message: conv.message });
    sent = true;
  }
  await services.store.updateLeadFollowupState(lead.id, {
    status: decision.nextStatus,
    nextActionAt: decision.nextActionAt,
    followupTouchCount: (lead.followupTouchCount ?? 0) + (sent ? 1 : 0),
    ...leasePatch(cfg, now, decision.nextActionAt),
  });
  return { sent };
}

export function startFollowupLoop(services: ApiServices): { stop: () => void } {
  const { enabled, tickMs, batchSize, sendMinMs, sendMaxMs, dailyCap, cfg } = readConfig();
  if (!enabled) {
    console.log("[followup] AUTO_FOLLOWUP_ENABLED 未开启，自动跟进循环不启动");
    return { stop: () => {} };
  }
  console.log(`[followup] 自动跟进循环启动 worker=${cfg.workerId}，每 ${tickMs}ms 一轮`);

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (dailyCount() >= dailyCap) {
        console.warn(`[followup] 当日发送已达上限 ${dailyCap}，跳过本轮`);
        return;
      }
      const now = new Date();
      const claimed = await services.store.claimDueLeads(cfg.workerId, now, cfg.leaseMs, batchSize);
      for (const { lead, prevWorkerId } of claimed) {
        if (dailyCount() >= dailyCap) break;
        try {
          const r = await processLead(services, lead, cfg, now, prevWorkerId);
          if (r.sent) {
            bumpDaily();
            await sleep(sendMinMs + Math.random() * (sendMaxMs - sendMinMs));
          }
        } catch (err) {
          console.error(
            `[followup] lead ${lead.id} 处理失败:`,
            err instanceof Error ? err.message : err,
          );
          await services.store
            .updateLeadFollowupState(lead.id, {
              nextActionAt: new Date(now.getTime() + cfg.intervalMs),
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error("[followup] tick 失败:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };

  const interval = setInterval(tick, tickMs);
  return { stop: () => clearInterval(interval) };
}

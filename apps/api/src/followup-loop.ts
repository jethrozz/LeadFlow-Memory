import type { ApiServices } from "./app.js";
import type { StoredLead } from "./store.js";
import { decideNextAction } from "./followup-decision.js";
import { loadPlaybookForCampaign } from "./playbook-loader.js";
import { sendFollowup, syncConversation } from "./conversation-service.js";

export type FollowupConfig = {
  intervalMs: number;
  maxTouches: number;
  deviceId?: string;
};

export type ProcessResult = { sent: boolean; skippedReason?: string };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function readConfig(): {
  enabled: boolean;
  tickMs: number;
  batchSize: number;
  sendMinMs: number;
  sendMaxMs: number;
  dailyCap: number;
  cfg: FollowupConfig;
} {
  const num = (v: string | undefined, d: number) => (v ? Number(v) : d);
  return {
    enabled: process.env.AUTO_FOLLOWUP_ENABLED === "true",
    tickMs: num(process.env.AUTO_FOLLOWUP_INTERVAL_MS, 60_000),
    batchSize: num(process.env.AUTO_FOLLOWUP_BATCH_SIZE, 10),
    sendMinMs: num(process.env.AUTO_FOLLOWUP_SEND_MIN_MS, 3000),
    sendMaxMs: num(process.env.AUTO_FOLLOWUP_SEND_MAX_MS, 8000),
    dailyCap: num(process.env.AUTO_FOLLOWUP_DAILY_CAP, 50),
    cfg: {
      intervalMs: num(process.env.AUTO_FOLLOWUP_INTERVAL_MS, 60_000),
      maxTouches: num(process.env.AUTO_FOLLOWUP_MAX_TOUCHES, 8),
      deviceId: process.env.AUTO_FOLLOWUP_DEVICE_ID || undefined,
    },
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

export async function processLead(
  services: ApiServices,
  lead: StoredLead,
  cfg: FollowupConfig,
  now: Date,
): Promise<ProcessResult> {
  const backoff = () =>
    services.store.updateLeadFollowupState(lead.id, {
      nextActionAt: new Date(now.getTime() + cfg.intervalMs),
    });

  // Resolve identity
  const identity = await services.store.getSocialIdentity(lead.id);
  const xhsUserId = identity?.redId ?? undefined;
  if (!xhsUserId) {
    console.warn(`[followup] lead ${lead.id} 缺 redId，跳过`);
    await backoff();
    return { sent: false, skippedReason: "no_identity" };
  }

  const deviceId = cfg.deviceId ?? (await services.store.getDefaultDevice())?.deviceId;
  if (!deviceId) {
    console.warn(`[followup] 无可用设备，跳过 lead ${lead.id}`);
    await backoff();
    return { sent: false, skippedReason: "no_device" };
  }

  const campaign = (await services.store.getCampaign(lead.campaignId)) ?? {};
  const playbook = await loadPlaybookForCampaign(campaign);

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
    await sendFollowup(services, { leadId: lead.id, deviceId, xhsUserId, message: conv.message });
    await services.store.updateLeadFollowupState(lead.id, {
      status: decision.nextStatus,
      nextActionAt: decision.nextActionAt,
      followupTouchCount: (lead.followupTouchCount ?? 0) + 1,
    });
    return { sent: true };
  }

  // Poll for replies
  const { newInboundCount, lastInboundContent } = await syncConversation(services, {
    leadId: lead.id,
    deviceId,
    xhsUserId,
  });

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
    await services.store.updateLeadFollowupState(lead.id, { nextActionAt: decision.nextActionAt });
    return { sent: false };
  }

  // Has reply — generate response and decide outcome
  const conv = await services.workflows.runConversion({
    leadId: lead.id,
    memorySpaceId: lead.memorySpaceId,
    customerMessage: lastInboundContent,
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
    await sendFollowup(services, { leadId: lead.id, deviceId, xhsUserId, message: conv.message });
    sent = true;
  }
  await services.store.updateLeadFollowupState(lead.id, {
    status: decision.nextStatus,
    nextActionAt: decision.nextActionAt,
    followupTouchCount: (lead.followupTouchCount ?? 0) + (sent ? 1 : 0),
  });
  return { sent };
}

export function startFollowupLoop(services: ApiServices): { stop: () => void } {
  const { enabled, tickMs, batchSize, sendMinMs, sendMaxMs, dailyCap, cfg } = readConfig();
  if (!enabled) {
    console.log("[followup] AUTO_FOLLOWUP_ENABLED 未开启，自动跟进循环不启动");
    return { stop: () => {} };
  }
  console.log(`[followup] 自动跟进循环启动，每 ${tickMs}ms 一轮`);

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
      const leads = await services.store.listActiveFollowupLeads(now, batchSize);
      for (const lead of leads) {
        if (dailyCount() >= dailyCap) break;
        try {
          const r = await processLead(services, lead, cfg, now);
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

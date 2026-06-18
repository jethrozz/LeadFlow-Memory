import { describe, expect, it } from "vitest";
import { createFakeServices, type ApiServices } from "./app.js";
import { processLead } from "./followup-loop.js";
import type { XhsConversationMessage } from "@leadflow/connectors";

const CFG = { intervalMs: 60_000, maxTouches: 8, deviceId: "d1", workerId: "test-worker", leaseMs: 90_000 };

async function seedLead(services: ApiServices, id: string, status: string) {
  await services.store.upsertCampaign({ id: "c1" });
  await services.store.upsertLead({
    id,
    campaignId: "c1",
    platform: "xhs",
    status,
    memorySpaceId: `s_${id}`,
    displayName: "X",
    autoFollowupEnabled: true,
    nextActionAt: new Date(),
    // 模拟「已被本 worker 认领」的不变量(真实流程里 claimDueLeads 已置)，
    // 否则续租的乐观锁守卫(expectedWorkerId)会 no-op。
    workerId: CFG.workerId,
    leaseExpiresAt: new Date(Date.now() + CFG.leaseMs),
  });
  await services.store.upsertSocialIdentity({
    leadId: id,
    platform: "xhs",
    externalUserId: "u1",
    redId: "red1",
    username: "X",
  });
}

describe("processLead", () => {
  it("首触：discovered → 发开场 → contacting", async () => {
    const services = createFakeServices();
    await seedLead(services, "l1", "discovered");
    const r = await processLead(services, (await services.store.getLead("l1"))!, CFG, new Date());
    expect(r.sent).toBe(true);
    const lead = await services.store.getLead("l1");
    expect(lead?.status).toBe("contacting");
    expect(lead?.followupTouchCount).toBe(1);
    const msgs = await services.store.listConversationMessages("l1");
    expect(msgs.some((m) => m.direction === "outbound")).toBe(true);
  });

  it("缺 redId → 跳过并退避", async () => {
    const services = createFakeServices();
    await services.store.upsertCampaign({ id: "c1" });
    await services.store.upsertLead({
      id: "l2",
      campaignId: "c1",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: "s",
      displayName: "X",
      autoFollowupEnabled: true,
      nextActionAt: new Date(),
      workerId: CFG.workerId,
      leaseExpiresAt: new Date(Date.now() + CFG.leaseMs),
    });
    // No socialIdentity written — redId will be missing
    const r = await processLead(services, (await services.store.getLead("l2"))!, CFG, new Date());
    expect(r.sent).toBe(false);
    expect(r.skippedReason).toBe("no_identity");
    const lead = await services.store.getLead("l2");
    expect(lead?.status).toBe("discovered"); // status unchanged
    expect(lead?.nextActionAt).not.toBeNull(); // backoff set
  });

  it("接管他人遗留的 contacting 线索 → 跑 handoff 恢复并写 handoff_recovered", async () => {
    const services = createFakeServices();
    await seedLead(services, "lh", "contacting");
    let handoffCalled = false;
    services.workflows = {
      ...services.workflows,
      runHandoffRecovery: async () => {
        handoffCalled = true;
        return { recoverySummary: "已恢复客户画像与下一步", artifact: { blobId: "0xproof" } as never };
      },
    } as never;
    // 无新回复，避免触发回复轮（聚焦验证接管）
    services.xhsChat = {
      ...services.xhsChat,
      getConversation: async () => ({ messages: [] }),
    } as never;

    const lead = (await services.store.getLead("lh"))!;
    await processLead(services, lead, CFG, new Date(), "worker-OLD");

    expect(handoffCalled).toBe(true);
    const events = await services.store.listTimelineEvents("lh");
    expect(events.some((e) => e.type === "handoff_recovered")).toBe(true);
  });

  it("discovered 被接管不跑 handoff（无上下文可恢复）", async () => {
    const services = createFakeServices();
    await seedLead(services, "ld", "discovered");
    let handoffCalled = false;
    services.workflows = {
      ...services.workflows,
      runHandoffRecovery: async () => {
        handoffCalled = true;
        return { recoverySummary: "x", artifact: { blobId: "y" } as never };
      },
      runConversion: async () => ({ message: "您好", memoryRef: "", artifact: {} as never, extractedFields: {}, outcome: "continue" as const }),
    } as never;
    services.xhsChat = {
      ...services.xhsChat,
      sendPrivateMessage: async () => ({ status: "sent", remoteMessageId: "out_1", sentAt: new Date().toISOString() }),
    } as never;

    const lead = (await services.store.getLead("ld"))!;
    await processLead(services, lead, CFG, new Date(), "worker-OLD");
    expect(handoffCalled).toBe(false);
  });

  it("回复轮：检测到新回复 + rejected → lost 不再发", async () => {
    const services = createFakeServices();
    await seedLead(services, "l3", "contacting");

    // Override workflows.runConversion to return rejected outcome
    services.workflows = {
      ...services.workflows,
      runConversion: async () => ({
        message: "好的打扰了",
        memoryRef: "",
        artifact: {} as never,
        extractedFields: {},
        outcome: "rejected" as const,
      }),
    };

    // Override xhsChat to return a new inbound message
    const reply: XhsConversationMessage = {
      id: "m1",
      direction: "inbound",
      content: "不需要，谢谢",
      sentAt: new Date().toISOString(),
    };
    services.xhsChat = {
      ...services.xhsChat,
      getConversation: async () => ({ messages: [reply] }),
      sendPrivateMessage: async () => ({ status: "sent", remoteMessageId: "out_1", sentAt: new Date().toISOString() }),
    } as never;

    await processLead(services, (await services.store.getLead("l3"))!, CFG, new Date());
    const lead = await services.store.getLead("l3");
    expect(lead?.status).toBe("lost");
    expect(lead?.nextActionAt).toBeNull();
  });
});

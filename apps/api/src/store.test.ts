import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./store.js";

describe("api store", () => {
  it("persists a lead and reads it back", async () => {
    const store = createMemoryStore();
    const lead = await store.upsertLead({
      id: "lead_001",
      campaignId: "campaign_001",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: "space_001",
      displayName: "重庆买房小陈",
    });

    expect(await store.getLead("lead_001")).toEqual(lead);
    expect(await store.listLeads()).toHaveLength(1);
  });

  it("appends memory refs, artifact refs, and timeline events per lead", async () => {
    const store = createMemoryStore();
    await store.upsertLead({
      id: "lead_001",
      campaignId: "campaign_001",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: "space_001",
      displayName: "重庆买房小陈",
    });

    await store.appendMemoryRef({
      leadId: "lead_001",
      memoryId: "mem_001",
      kind: "budget",
      summary: "客户预算 130 万以内",
      confidence: 0.9,
    });
    await store.appendArtifactRef({
      leadId: "lead_001",
      artifactType: "lead_discovery_report",
      blobId: "0xabc",
    });
    await store.appendTimelineEvent({
      leadId: "lead_001",
      type: "lead_discovered",
      summary: "从小红书评论发现线索",
      memoryRefs: ["mem_001"],
      artifactRefs: ["0xabc"],
    });

    expect(await store.listMemoryRefs("lead_001")).toHaveLength(1);
    expect(await store.listArtifactRefs("lead_001")).toHaveLength(1);
    expect((await store.listTimelineEvents("lead_001"))[0]?.type).toBe("lead_discovered");
  });

  it("listActiveFollowupLeads 只返回到期且活跃的线索", async () => {
    const store = createMemoryStore();
    await store.upsertCampaign({ id: "c1" });
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);
    await store.upsertLead({ id: "a", campaignId: "c1", platform: "xhs", status: "discovered", memorySpaceId: "s_a", displayName: "A", autoFollowupEnabled: true, nextActionAt: past });
    await store.upsertLead({ id: "b", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s_b", displayName: "B", autoFollowupEnabled: true, nextActionAt: future });
    await store.upsertLead({ id: "c", campaignId: "c1", platform: "xhs", status: "discovered", memorySpaceId: "s_c", displayName: "C", autoFollowupEnabled: false, nextActionAt: past });
    await store.upsertLead({ id: "d", campaignId: "c1", platform: "xhs", status: "converted", memorySpaceId: "s_d", displayName: "D", autoFollowupEnabled: true, nextActionAt: past });

    const due = await store.listActiveFollowupLeads(new Date(), 10);
    expect(due.map((l) => l.id)).toEqual(["a"]); // b 未到期、c 未启用、d 非活跃状态
  });

  it("updateLeadFollowupState 更新状态/计数/下次时间", async () => {
    const store = createMemoryStore();
    await store.upsertCampaign({ id: "c1" });
    await store.upsertLead({ id: "a", campaignId: "c1", platform: "xhs", status: "discovered", memorySpaceId: "s_a", displayName: "A" });
    await store.updateLeadFollowupState("a", { status: "contacting", followupTouchCount: 1, nextActionAt: null });
    const lead = await store.getLead("a");
    expect(lead?.status).toBe("contacting");
    expect(lead?.followupTouchCount).toBe(1);
    expect(lead?.nextActionAt).toBeNull();
  });

  it("claimDueLeads 只认领无主/过期/本人，且记录 prevWorkerId", async () => {
    const store = createMemoryStore();
    await store.upsertCampaign({ id: "c1" });
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 60_000);
    // a: 无主到期 → 可领
    await store.upsertLead({ id: "a", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "A", autoFollowupEnabled: true, nextActionAt: past });
    // b: 别人持有且租约未过期 → 不可领
    await store.upsertLead({ id: "b", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "B", autoFollowupEnabled: true, nextActionAt: past, workerId: "other", leaseExpiresAt: future });
    // c: 别人持有但租约过期 → 可领，prevWorkerId=other
    await store.upsertLead({ id: "c", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "C", autoFollowupEnabled: true, nextActionAt: past, workerId: "other", leaseExpiresAt: past });

    const now = new Date();
    const claimed = await store.claimDueLeads("me", now, 90_000, 10);
    const ids = claimed.map((x) => x.lead.id).sort();
    expect(ids).toEqual(["a", "c"]);
    const cClaim = claimed.find((x) => x.lead.id === "c");
    expect(cClaim?.prevWorkerId).toBe("other");
    expect(cClaim?.lead.workerId).toBe("me");
    // 认领后 b 不受影响
    expect((await store.getLead("b"))?.workerId).toBe("other");
    // 再认领一次：已被 me 持有且租约未过期 → 仍可领(本人)，但 b 仍不可领
    const again = await store.claimDueLeads("me", new Date(), 90_000, 10);
    expect(again.map((x) => x.lead.id).sort()).toEqual(["a", "c"]);
  });

  it("updateLeadFollowupState 带 expectedWorkerId 时，持有者变更则不覆盖(乐观锁)", async () => {
    const store = createMemoryStore();
    await store.upsertCampaign({ id: "c1" });
    await store.upsertLead({ id: "a", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "A", workerId: "me", leaseExpiresAt: new Date(Date.now() + 90_000) });

    // 我仍持有 → 续租生效
    await store.updateLeadFollowupState("a", { nextActionAt: new Date(Date.now() + 30_000), workerId: "me", leaseExpiresAt: new Date(Date.now() + 90_000) }, { expectedWorkerId: "me" });
    expect((await store.getLead("a"))?.workerId).toBe("me");

    // 模拟崩溃：被改成 worker_crashed_demo
    await store.updateLeadFollowupState("a", { workerId: "worker_crashed_demo", leaseExpiresAt: new Date(Date.now() - 1000) });
    // 我收尾再续租，但已不持有 → no-op，不能覆盖回 me
    await store.updateLeadFollowupState("a", { workerId: "me", leaseExpiresAt: new Date(Date.now() + 90_000) }, { expectedWorkerId: "me" });
    expect((await store.getLead("a"))?.workerId).toBe("worker_crashed_demo");
  });

  it("appends conversation messages in order", async () => {
    const store = createMemoryStore();
    await store.appendConversationMessage("lead_001", {
      direction: "inbound",
      content: "想看看渝北 130 万以内的三房",
      sentAt: "2026-06-11T10:00:00.000Z",
    });
    await store.appendConversationMessage("lead_001", {
      direction: "outbound",
      content: "我帮你筛几个渝北的小区",
      sentAt: "2026-06-11T10:05:00.000Z",
    });

    const messages = await store.listConversationMessages("lead_001");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.direction).toBe("inbound");
    expect(await store.listConversationMessages("nonexistent")).toHaveLength(0);
  });
});

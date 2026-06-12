import { describe, expect, it } from "vitest";
import { createStore } from "./store.js";

describe("api store", () => {
  it("persists a lead and reads it back", () => {
    const store = createStore();
    const lead = store.upsertLead({
      id: "lead_001",
      campaignId: "campaign_001",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: "space_001",
      displayName: "重庆买房小陈",
    });

    expect(store.getLead("lead_001")).toEqual(lead);
    expect(store.listLeads()).toHaveLength(1);
  });

  it("appends memory refs, artifact refs, and timeline events per lead", () => {
    const store = createStore();
    store.upsertLead({
      id: "lead_001",
      campaignId: "campaign_001",
      platform: "xhs",
      status: "discovered",
      memorySpaceId: "space_001",
      displayName: "重庆买房小陈",
    });

    store.appendMemoryRef({
      leadId: "lead_001",
      memoryId: "mem_001",
      kind: "budget",
      summary: "客户预算 130 万以内",
      confidence: 0.9,
    });
    store.appendArtifactRef({
      leadId: "lead_001",
      artifactType: "lead_discovery_report",
      blobId: "0xabc",
    });
    store.appendTimelineEvent({
      leadId: "lead_001",
      type: "lead_discovered",
      summary: "从小红书评论发现线索",
      memoryRefs: ["mem_001"],
      artifactRefs: ["0xabc"],
    });

    expect(store.listMemoryRefs("lead_001")).toHaveLength(1);
    expect(store.listArtifactRefs("lead_001")).toHaveLength(1);
    expect(store.listTimelineEvents("lead_001")[0]?.type).toBe("lead_discovered");
  });

  it("appends conversation messages in order", () => {
    const store = createStore();
    store.appendConversationMessage("lead_001", {
      direction: "inbound",
      content: "想看看渝北 130 万以内的三房",
      sentAt: "2026-06-11T10:00:00.000Z",
    });
    store.appendConversationMessage("lead_001", {
      direction: "outbound",
      content: "我帮你筛几个渝北的小区",
      sentAt: "2026-06-11T10:05:00.000Z",
    });

    const messages = store.listConversationMessages("lead_001");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.direction).toBe("inbound");
  });
});

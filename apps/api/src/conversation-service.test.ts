import { describe, expect, it } from "vitest";
import { createFakeServices } from "./app.js";
import { sendFollowup, syncConversation } from "./conversation-service.js";

describe("conversation-service", () => {
  it("sendFollowup 发送并记录 outbound + timeline", async () => {
    const services = createFakeServices();
    await services.store.upsertCampaign({ id: "c1" });
    await services.store.upsertLead({ id: "l1", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "X" });

    const res = await sendFollowup(services, { leadId: "l1", deviceId: "d1", xhsUserId: "red1", message: "你好" });
    expect(res.status).toBe("sent");

    const msgs = await services.store.listConversationMessages("l1");
    expect(msgs.some((m) => m.direction === "outbound" && m.content === "你好")).toBe(true);
  });

  it("syncConversation 去重，重复同步不重复入库，返回新 inbound 数", async () => {
    const services = createFakeServices();
    await services.store.upsertCampaign({ id: "c1" });
    await services.store.upsertLead({ id: "l1", campaignId: "c1", platform: "xhs", status: "contacting", memorySpaceId: "s", displayName: "X" });

    const first = await syncConversation(services, { leadId: "l1", deviceId: "d1", xhsUserId: "red1" });
    expect(first.newInboundCount).toBeGreaterThan(0);

    const second = await syncConversation(services, { leadId: "l1", deviceId: "d1", xhsUserId: "red1" });
    expect(second.newInboundCount).toBe(0); // FakeXhsChatClient returns same msg, dedup prevents re-insert

    const msgs = await services.store.listConversationMessages("l1");
    const inbound = msgs.filter((m) => m.direction === "inbound");
    expect(inbound.length).toBe(1);
  });
});

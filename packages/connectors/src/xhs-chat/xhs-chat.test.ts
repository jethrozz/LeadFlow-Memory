import { describe, expect, it } from "vitest";
import { createXhsChatClientFromEnv, FakeXhsChatClient } from "../index.js";

describe("XHS chat connector", () => {
  it("syncs conversation messages for a lead identity", async () => {
    const client = new FakeXhsChatClient();
    const messages = await client.getConversation({
      deviceId: "device-1",
      xhsUserId: "xhs_001",
      xhsUsername: "重庆买房小陈",
      sinceTime: "2026-06-11T10:00:00.000Z",
    });

    expect(messages[0]?.content).toContain("渝北");
  });

  it("sends private messages", async () => {
    const client = new FakeXhsChatClient();
    const result = await client.sendPrivateMessage({
      deviceId: "device-1",
      xhsUserId: "xhs_001",
      xhsUsername: "重庆买房小陈",
      message: "我整理几套渝北三房给你，可以加微信吗？",
    });

    expect(result.status).toBe("sent");
  });
});

describe("XHS chat client configuration", () => {
  it("uses fake client when XHS_CHAT_MODE=fake", () => {
    const client = createXhsChatClientFromEnv({ XHS_CHAT_MODE: "fake" });
    expect(client).toBeInstanceOf(FakeXhsChatClient);
  });
});

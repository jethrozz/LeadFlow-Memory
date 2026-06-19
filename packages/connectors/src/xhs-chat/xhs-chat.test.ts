import { describe, expect, it } from "vitest";
import { createXhsChatClientFromEnv, FakeXhsChatClient, XhsMidsceneClient } from "../index.js";

describe("XHS chat connector", () => {
  it("syncs conversation messages for a lead identity", async () => {
    const client = new FakeXhsChatClient();
    const result = await client.getConversation({
      deviceId: "device-1",
      xhsUserId: "xhs_001",
      xhsUsername: "重庆买房小陈",
      sinceTime: "2026-06-11T10:00:00.000Z",
    });

    expect(result.messages[0]?.content).toContain("渝北");
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

  it("returns a screenshot data url from the fake client", async () => {
    const client = new FakeXhsChatClient();
    const result = await client.getScreenshot({ deviceId: "device-1" });

    expect(result.imageDataUrl).toMatch(/^data:image\/(png|jpeg);base64,/);
    expect(typeof result.capturedAt).toBe("string");
    expect(Number.isNaN(Date.parse(result.capturedAt))).toBe(false);
  });
});

describe("XHS chat client configuration", () => {
  it("uses fake client when XHS_CHAT_MODE=fake", () => {
    const client = createXhsChatClientFromEnv({ XHS_CHAT_MODE: "fake" });
    expect(client).toBeInstanceOf(FakeXhsChatClient);
  });

  it("defaults to in-process Midscene client (no device connection at construction)", () => {
    const client = createXhsChatClientFromEnv({ MIDSCENE_MODEL_API_KEY: "test-key" });
    expect(client).toBeInstanceOf(XhsMidsceneClient);
  });
});

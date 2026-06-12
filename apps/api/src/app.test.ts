import { describe, expect, it } from "vitest";
import { createApp, createFakeServices } from "./app.js";

describe("api app", () => {
  const app = createApp(createFakeServices());

  it("returns dashboard lead list", async () => {
    const response = await app.request("/api/dashboard/leads");
    expect(response.status).toBe(200);
    const body = await response.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("returns 404 for unknown lead detail (store is empty initially)", async () => {
    const response = await app.request("/api/dashboard/leads/lead_chen");
    expect(response.status).toBe(404);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("LEAD_NOT_FOUND");
  });

  it("returns 404 for unknown lead detail", async () => {
    const response = await app.request("/api/dashboard/leads/missing");
    expect(response.status).toBe(404);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("LEAD_NOT_FOUND");
  });

  it("syncs XHS conversation through connector", async () => {
    const response = await app.request("/api/leads/lead_chen/conversation/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-1",
        xhsUserId: "xhs_001",
        xhsUsername: "重庆买房小陈",
        sinceTime: "2026-06-11T10:00:00.000Z",
      }),
    });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect((json as { messages: Array<{ content: string }> }).messages[0].content).toContain("渝北");
  });

  it("stores a Walrus artifact through the API", async () => {
    const response = await app.request("/api/artifacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "lead_001",
        type: "handoff_proof",
        data: { recoveredBy: "worker-2" },
      }),
    });

    expect(response.status).toBe(201);
    const json = await response.json() as { blobId: string };
    expect(json.blobId).toMatch(/^fake_blob_/);
  });

  it("writes and recalls MemWal memory through the API", async () => {
    const writeResponse = await app.request("/api/memories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "lead_001",
        memorySpaceId: "space_001",
        content: "客户关注渝北三房，总价 130 万以内。",
        metadata: {
          source: "conversion",
          confidence: 0.9,
          artifactRefs: [],
        },
      }),
    });

    expect(writeResponse.status).toBe(201);

    const recallResponse = await app.request("/api/memories/recall", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "lead_001",
        memorySpaceId: "space_001",
        query: "渝北",
        limit: 3,
      }),
    });

    expect(recallResponse.status).toBe(200);
    const json = await recallResponse.json() as { memories: Array<{ content: string }> };
    expect(json.memories[0].content).toContain("渝北");
  });

  it("runs discovery workflow through the API", async () => {
    const response = await app.request("/api/workflows/discovery/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "lead_001",
        memorySpaceId: "space_001",
        sourceText: "想看看渝北 130 万以内的三房",
      }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect((json as { artifact: { blobId: string } }).artifact.blobId).toBeTruthy();
  });

  it("syncs XHS conversation through connector", async () => {
    const response = await app.request("/api/leads/lead_001/conversation/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-1",
        xhsUserId: "xhs_001",
        xhsUsername: "重庆买房小陈",
      }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect((json as { messages: Array<{ content: string }> }).messages[0].content).toContain("渝北");
  });

  it("sends XHS private message through connector", async () => {
    const response = await app.request("/api/leads/lead_001/conversation/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-1",
        xhsUserId: "xhs_001",
        xhsUsername: "重庆买房小陈",
        message: "我整理几套渝北三房给你，可以加微信吗？",
      }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect((json as { status: string }).status).toBe("sent");
  });

  it("dashboard reflects workflow outputs instead of fixtures", async () => {
    await app.request("/api/workflows/discovery/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "lead_e2e",
        memorySpaceId: "space_e2e",
        sourceText: "想看看渝北 130 万以内的三房",
      }),
    });

    const response = await app.request("/api/dashboard/leads/lead_e2e");
    expect(response.status).toBe(200);
    const detail = await response.json();
    expect((detail as { memories: unknown[] }).memories.length).toBeGreaterThan(0);
    expect((detail as { artifacts: unknown[] }).artifacts.length).toBeGreaterThan(0);
    expect(
      (detail as { timeline: Array<{ type: string }> }).timeline.some(
        (e) => e.type === "lead_discovered"
      )
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { createApp, createFakeServices } from "./app.js";

describe("api app", () => {
  const app = createApp(createFakeServices());

  it("returns dashboard lead list", async () => {
    const response = await app.request("/api/dashboard/leads");
    expect(response.status).toBe(200);
    const body = await response.json() as { items: Array<{ displayName: string }> };
    expect(body.items[0].displayName).toBe("陈薇");
  });

  it("returns dashboard lead detail", async () => {
    const response = await app.request("/api/dashboard/leads/lead_chen");
    expect(response.status).toBe(200);
    const body = await response.json() as { lead: { id: string }; artifacts: Array<{ blobId: string }> };
    expect(body.lead.id).toBe("lead_chen");
    expect(body.artifacts[0].blobId).toMatch(/^0x/);
  });

  it("returns 404 for unknown lead detail", async () => {
    const response = await app.request("/api/dashboard/leads/missing");
    expect(response.status).toBe(404);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe("LEAD_NOT_FOUND");
  });

  it("accepts a conversation sync request as a skeleton endpoint", async () => {
    const response = await app.request("/api/leads/lead_chen/conversation/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sinceTime: "2026-06-11T10:00:00.000Z" }),
    });
    expect(response.status).toBe(202);
    const body = await response.json() as { workflowRun: { type: string }; channel: string };
    expect(body.workflowRun.type).toBe("conversion");
    expect(body.channel).toBe("mcp-xhs-chat");
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
});

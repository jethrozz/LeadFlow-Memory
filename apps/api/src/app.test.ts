import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("api app", () => {
  const app = createApp();

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
});

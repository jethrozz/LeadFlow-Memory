import { describe, expect, it } from "vitest";
import { FakeMemWalClient } from "./index.js";

describe("MemWal memory client", () => {
  it("writes and recalls lead-scoped memory", async () => {
    const client = new FakeMemWalClient();

    const written = await client.writeMemory({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      content: "客户预算 130 万以内，关注渝北三房。",
      metadata: {
        source: "conversion",
        confidence: 0.92,
        artifactRefs: ["artifact_001"],
      },
    });

    const recalled = await client.recall({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      query: "客户预算",
      limit: 5,
    });

    expect(written.id).toMatch(/^mem_/);
    expect(recalled[0]?.content).toContain("130 万");
  });
});

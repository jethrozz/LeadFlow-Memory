import { describe, expect, it } from "vitest";
import { FakeLlmProvider } from "@leadflow/llm";
import { FakeMemWalClient } from "@leadflow/memwal";
import { FakeWalrusArtifactClient } from "@leadflow/walrus";
import { FakeXhsDiscoveryClient } from "@leadflow/connectors";
import { runCampaignDiscoveryWorkflow } from "./campaign-discovery-workflow.js";
import type { WorkflowServices } from "./types.js";

function makeServices(): WorkflowServices {
  return {
    llm: new FakeLlmProvider({
      content: JSON.stringify({
        relevant: true,
        hasIntent: true,
        intentLevel: "A",
        summary: "购房意向",
        memory: "客户预算130万",
      }),
    }),
    memwal: new FakeMemWalClient(),
    walrus: new FakeWalrusArtifactClient(),
    xhsDiscovery: new FakeXhsDiscoveryClient(),
  };
}

describe("campaign discovery workflow", () => {
  it("runs campaign discovery and returns stats", async () => {
    const services = makeServices();
    const result = await runCampaignDiscoveryWorkflow(services, {
      campaignId: "campaign_test",
      seedKeywords: ["渝北三房"],
      maxPostsPerRun: 2,
      maxCommentsPerPost: 5,
      delayMs: 0,
    });

    expect(result.campaignId).toBe("campaign_test");
    expect(result.searched).toBeGreaterThan(0);
    expect(result.leadsCreated).toBeGreaterThan(0);
    expect(result.artifacts.length).toBeGreaterThan(0);
  });

  it("throws if xhsDiscovery is not provided", async () => {
    const services: WorkflowServices = {
      llm: new FakeLlmProvider({ content: "{}" }),
      memwal: new FakeMemWalClient(),
      walrus: new FakeWalrusArtifactClient(),
    };

    await expect(
      runCampaignDiscoveryWorkflow(services, {
        campaignId: "campaign_test",
        seedKeywords: ["test"],
        delayMs: 0,
      }),
    ).rejects.toThrow("xhsDiscovery service is required");
  });
});

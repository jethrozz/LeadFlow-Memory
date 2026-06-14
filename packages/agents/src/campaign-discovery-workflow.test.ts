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
    expect(result.leads.length).toBe(result.leadsCreated);
    expect(result.leads[0]).toMatchObject({ platform: "xhs", leadId: expect.any(String) });
  });

  it("captures user_id and redId separately for post-author and comment leads", async () => {
    const services = makeServices();
    const result = await runCampaignDiscoveryWorkflow(services, {
      campaignId: "campaign_test",
      seedKeywords: ["渝北三房"],
      maxPostsPerRun: 2,
      maxCommentsPerPost: 5,
      delayMs: 0,
    });

    // 情况 1：帖子作者有意向——只能拿到 user_id，redId 需用搜索阶段的 xsecToken 进详情页换取
    const postLead = result.leads.find((l) => l.sourceType === "post");
    expect(postLead?.authorUserId).toBe("xhs_user_001");
    expect(postLead?.authorRedId).toBe("red_chongqing_001");

    // 情况 2：宣传帖评论区有意向用户——同样 user_id 与 redId 都要拿到且区分
    const commentLead = result.leads.find((l) => l.sourceType === "comment");
    expect(commentLead?.authorUserId).toBe("xhs_user_003");
    expect(commentLead?.authorRedId).toBe("red_observer_003");
  });

  it("still produces leads with identity when Walrus store fails", async () => {
    const services = makeServices();
    // 模拟 Walrus 写入端不可用（如 DNS 解析失败 / publisher 宕机）
    services.walrus = {
      store: async () => {
        throw new Error("walrus down");
      },
      read: async () => {
        throw new Error("walrus down");
      },
    };

    const result = await runCampaignDiscoveryWorkflow(services, {
      campaignId: "campaign_test",
      seedKeywords: ["渝北三房"],
      maxPostsPerRun: 2,
      maxCommentsPerPost: 5,
      delayMs: 0,
    });

    // Walrus 挂了也不能中止整轮：线索仍要产出，身份仍要捕获
    expect(result.leadsCreated).toBeGreaterThan(0);
    const postLead = result.leads.find((l) => l.sourceType === "post");
    expect(postLead?.authorUserId).toBe("xhs_user_001");
    expect(postLead?.authorRedId).toBe("red_chongqing_001");
    // artifact blobId 为空（存储失败的占位），但不影响线索本体
    expect(postLead?.sourceArtifactBlobId).toBe("");
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

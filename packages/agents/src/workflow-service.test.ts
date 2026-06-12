import { describe, expect, it } from "vitest";
import { FakeLlmProvider } from "@leadflow/llm";
import { FakeMemWalClient } from "@leadflow/memwal";
import { FakeWalrusArtifactClient } from "@leadflow/walrus";
import { createWorkflowService } from "./workflow-service.js";

describe("LeadFlow workflow service", () => {
  it("runs discovery and writes initial memory plus source artifact", async () => {
    const service = createWorkflowService({
      llm: new FakeLlmProvider({
        content: JSON.stringify({
          intentLevel: "A",
          summary: "客户评论表达购房意向，关注渝北三房。",
          memory: "客户关注渝北三房，总价约 130 万。",
        }),
      }),
      memwal: new FakeMemWalClient(),
      walrus: new FakeWalrusArtifactClient(),
    });

    const result = await service.runDiscovery({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      sourceText: "想看看渝北 130 万以内的三房",
    });

    expect(result.intentLevel).toBe("A");
    expect(result.memoryRef).toMatch(/^mem_/);
    expect(result.artifact.blobId).toMatch(/^fake_blob_/);
  });

  it("runs conversion and produces a follow-up message", async () => {
    const service = createWorkflowService({
      llm: new FakeLlmProvider({
        content: JSON.stringify({
          message: "我按你说的预算和区域整理几套渝北三房，可以加微信发你吗？",
          memory: "下一步策略：索要微信发送房源对比。",
          extractedFields: { budget: "130万以内", district: "渝北", layout: "三房" },
        }),
      }),
      memwal: new FakeMemWalClient(),
      walrus: new FakeWalrusArtifactClient(),
    });

    await service.runDiscovery({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      sourceText: "想看看渝北 130 万以内的三房",
    });

    const result = await service.runConversion({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      customerMessage: "可以，先看看有没有新房补贴",
    });

    expect(result.message).toContain("加微信");
    expect(result.memoryRef).toMatch(/^mem_/);
  });

  it("runs handoff recovery with recalled memory and proof artifact", async () => {
    const memwal = new FakeMemWalClient();
    await memwal.writeMemory({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      content: "客户预算 130 万以内，关注渝北三房。",
      metadata: { source: "conversion", confidence: 0.9, artifactRefs: [] },
    });

    const service = createWorkflowService({
      llm: new FakeLlmProvider({
        content: JSON.stringify({
          recoverySummary: "Worker-2 已恢复客户预算、区域和下一步沟通策略。",
        }),
      }),
      memwal,
      walrus: new FakeWalrusArtifactClient(),
    });

    const result = await service.runHandoffRecovery({
      leadId: "lead_001",
      memorySpaceId: "space_001",
      fromWorkerId: "worker-1",
      toWorkerId: "worker-2",
    });

    expect(result.recoverySummary).toContain("Worker-2");
    expect(result.artifact.blobId).toMatch(/^fake_blob_/);
  });
});

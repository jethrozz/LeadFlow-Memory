import { describe, expect, it } from "vitest";
import { FakeLlmProvider } from "@leadflow/llm";
import { FakeMemWalClient } from "@leadflow/memwal";
import { FakeWalrusArtifactClient } from "@leadflow/walrus";
import { runConversionWorkflow } from "./conversion-workflow.js";
import type { WorkflowServices } from "./types.js";

function services(content: string): WorkflowServices {
  return {
    llm: new FakeLlmProvider({ content }),
    memwal: new FakeMemWalClient(),
    walrus: new FakeWalrusArtifactClient(),
  };
}

describe("conversion workflow", () => {
  it("回复轮解析 outcome=goal_reached", async () => {
    const result = await runConversionWorkflow(
      services(JSON.stringify({ message: "好的，加您微信", memory: "已要到微信", outcome: "goal_reached" })),
      { leadId: "l1", memorySpaceId: "space_l1", customerMessage: "我微信是 abc" },
    );
    expect(result.outcome).toBe("goal_reached");
    expect(result.message).toBe("好的，加您微信");
  });

  it("outcome 缺失/非法时默认 continue", async () => {
    const result = await runConversionWorkflow(
      services(JSON.stringify({ message: "了解一下您的预算？" })),
      { leadId: "l1", memorySpaceId: "space_l1", customerMessage: "你好" },
    );
    expect(result.outcome).toBe("continue");
  });

  it("opening 模式（无 customerMessage）强制 continue 且能生成开场", async () => {
    const result = await runConversionWorkflow(
      services(JSON.stringify({ message: "您好，看到您在找渝北三房", memory: "首次触达", outcome: "rejected" })),
      { leadId: "l1", memorySpaceId: "space_l1" },
    );
    expect(result.message).toBe("您好，看到您在找渝北三房");
    expect(result.outcome).toBe("continue"); // opening ignores LLM's outcome
  });
});

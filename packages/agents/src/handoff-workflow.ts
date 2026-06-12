import { createArtifactPayload } from "@leadflow/walrus";
import { handoffSystemPrompt } from "./prompts.js";
import type { HandoffRecoveryInput, HandoffRecoveryResult, WorkflowServices } from "./types.js";

export async function runHandoffRecoveryWorkflow(
  services: WorkflowServices,
  input: HandoffRecoveryInput,
): Promise<HandoffRecoveryResult> {
  const recalled = await services.memwal.recall({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    query: "客户画像 下一步策略 联系方式 看房",
    limit: 10,
  });

  const result = await services.llm.chatJson({
    system: handoffSystemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          fromWorkerId: input.fromWorkerId,
          toWorkerId: input.toWorkerId,
          recalledMemory: recalled.map((memory) => memory.content),
        }),
      },
    ],
  });

  const artifact = await services.walrus.store(
    createArtifactPayload({
      leadId: input.leadId,
      type: "handoff_proof",
      data: { input, recalled, result },
    }),
  );

  return {
    recoverySummary: String(result.recoverySummary ?? ""),
    artifact,
  };
}

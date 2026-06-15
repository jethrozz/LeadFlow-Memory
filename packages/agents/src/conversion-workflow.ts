import { createArtifactPayload } from "@leadflow/walrus";
import { buildConversionPrompt } from "./prompts.js";
import { safeWalrusStore } from "./walrus-utils.js";
import type { ConversionInput, ConversionResult, WorkflowServices } from "./types.js";

export async function runConversionWorkflow(
  services: WorkflowServices,
  input: ConversionInput,
): Promise<ConversionResult> {
  const recalled = await services.memwal.recall({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    query: input.customerMessage,
    limit: 5,
  });

  const systemPrompt = buildConversionPrompt(input.playbook);

  const result = await services.llm.chatJson({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          customerMessage: input.customerMessage,
          recalledMemory: recalled.map((memory) => memory.content),
        }),
      },
    ],
  });

  const artifact = await safeWalrusStore(
    services.walrus,
    createArtifactPayload({
      leadId: input.leadId,
      type: "conversion_decision",
      data: { customerMessage: input.customerMessage, recalled, result },
    }),
  );

  const memory = await services.memwal.writeMemory({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    content: String(result.memory ?? result.message ?? input.customerMessage),
    metadata: {
      source: "conversion",
      confidence: 0.88,
      artifactRefs: [artifact.blobId],
    },
  });

  return {
    message: String(result.message ?? ""),
    memoryRef: memory.id,
    artifact,
    extractedFields: (result.extractedFields ?? {}) as Record<string, unknown>,
  };
}

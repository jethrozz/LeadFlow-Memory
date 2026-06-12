import { createArtifactPayload } from "@leadflow/walrus";
import { discoverySystemPrompt } from "./prompts.js";
import type { DiscoveryInput, DiscoveryResult, WorkflowServices } from "./types.js";

export async function runDiscoveryWorkflow(
  services: WorkflowServices,
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const analysis = await services.llm.chatJson({
    system: discoverySystemPrompt,
    messages: [{ role: "user", content: input.sourceText }],
  });

  const memoryText = String(analysis.memory ?? analysis.summary ?? input.sourceText);
  const artifact = await services.walrus.store(
    createArtifactPayload({
      leadId: input.leadId,
      type: "lead_discovery_report",
      data: { sourceText: input.sourceText, analysis },
    }),
  );

  const memory = await services.memwal.writeMemory({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    content: memoryText,
    metadata: {
      source: "discovery",
      confidence: 0.85,
      artifactRefs: [artifact.blobId],
    },
  });

  return {
    intentLevel: String(analysis.intentLevel ?? "B"),
    summary: String(analysis.summary ?? memoryText),
    memoryRef: memory.id,
    artifact,
  };
}

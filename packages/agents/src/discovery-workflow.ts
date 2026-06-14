import { createArtifactPayload } from "@leadflow/walrus";
import { buildDiscoveryPrompt } from "./prompts.js";
import { safeWalrusStore } from "./walrus-utils.js";
import type { DiscoveryInput, DiscoveryResult, WorkflowServices } from "./types.js";

export async function runDiscoveryWorkflow(
  services: WorkflowServices,
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const systemPrompt = buildDiscoveryPrompt(input.playbook?.profile_fields);

  const analysis = await services.llm.chatJson({
    system: systemPrompt,
    messages: [{ role: "user", content: input.sourceText }],
  });

  const memoryText = String(analysis.memory ?? analysis.summary ?? input.sourceText);
  const artifact = await safeWalrusStore(
    services.walrus,
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
    extractedFields: (analysis.extractedFields ?? {}) as Record<string, unknown>,
    needs: Array.isArray(analysis.needs) ? analysis.needs.map(String) : [],
    concerns: Array.isArray(analysis.concerns) ? analysis.concerns.map(String) : [],
  };
}

import { createArtifactPayload } from "@leadflow/walrus";
import { buildConversionPrompt } from "./prompts.js";
import { safeWalrusStore } from "./walrus-utils.js";
import type {
  ConversionInput,
  ConversionOutcome,
  ConversionResult,
  WorkflowServices,
} from "./types.js";

const OPENING_RECALL_QUERY = "客户购房需求 预算 区域 户型 顾虑";

function parseOutcome(value: unknown): ConversionOutcome {
  if (value === "goal_reached" || value === "rejected") return value;
  return "continue";
}

export async function runConversionWorkflow(
  services: WorkflowServices,
  input: ConversionInput,
): Promise<ConversionResult> {
  const isOpening = !input.customerMessage;
  const recallQuery = input.customerMessage ?? OPENING_RECALL_QUERY;

  let recalled: Awaited<ReturnType<typeof services.memwal.recall>> = [];
  try {
    recalled = await services.memwal.recall({
      leadId: input.leadId,
      memorySpaceId: input.memorySpaceId,
      query: recallQuery,
      limit: 5,
    });
  } catch (err) {
    console.warn(
      "[conversion] recall failed, continuing without memory:",
      err instanceof Error ? err.message : err,
    );
  }

  const systemPrompt = buildConversionPrompt(input.playbook, isOpening ? "opening" : "reply");

  const raw = await services.llm.chatJson({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          customerMessage: input.customerMessage ?? "(首次主动触达，请生成开场白)",
          recalledMemory: recalled.map((memory) => memory.content),
        }),
      },
    ],
  }) as {
    message?: unknown;
    memory?: unknown;
    extractedFields?: unknown;
    outcome?: unknown;
  };

  const artifact = await safeWalrusStore(
    services.walrus,
    createArtifactPayload({
      leadId: input.leadId,
      type: "conversion_decision",
      data: { customerMessage: input.customerMessage ?? null, recalled, result: raw },
    }),
  );

  const memory = await services.memwal.writeMemory({
    leadId: input.leadId,
    memorySpaceId: input.memorySpaceId,
    // fallback: if no memory fact, use reply text; if opening mode, use customer's words
    content: String(raw.memory ?? raw.message ?? input.customerMessage ?? ""),
    metadata: {
      source: "conversion",
      confidence: 0.88,
      artifactRefs: [artifact.blobId],
    },
  });

  return {
    message: String(raw.message ?? ""),
    memoryRef: memory.id,
    artifact,
    extractedFields: (raw.extractedFields ?? {}) as Record<string, unknown>,
    outcome: isOpening ? "continue" : parseOutcome(raw.outcome),
  };
}

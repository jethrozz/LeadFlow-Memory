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

  // 只写 LLM 明确给出的"已确认事实"（raw.memory）。为空表示本轮无新事实——
  // 不回退写 message/customerMessage，避免把我方话术或臆测写进长期记忆污染召回。
  let memoryRef = "";
  const memoryContent = typeof raw.memory === "string" ? raw.memory.trim() : "";
  if (memoryContent) {
    // 写记忆容错：MemWal 上游（embedding）偶发 429/不可用时不应阻断发送，降级为无 memoryRef。
    try {
      const memory = await services.memwal.writeMemory({
        leadId: input.leadId,
        memorySpaceId: input.memorySpaceId,
        content: memoryContent,
        metadata: {
          source: "conversion",
          confidence: 0.88,
          artifactRefs: [artifact.blobId],
        },
      });
      memoryRef = memory.id;
    } catch (err) {
      console.warn(
        "[conversion] writeMemory failed, continuing without memory ref:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    message: String(raw.message ?? ""),
    memoryRef,
    artifact,
    extractedFields: (raw.extractedFields ?? {}) as Record<string, unknown>,
    outcome: isOpening ? "continue" : parseOutcome(raw.outcome),
  };
}

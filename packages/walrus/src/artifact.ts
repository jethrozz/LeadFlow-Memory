import type { WalrusArtifactPayload, WalrusArtifactType } from "./types.js";

export function createArtifactPayload(input: {
  leadId: string;
  type: WalrusArtifactType;
  data: unknown;
}): WalrusArtifactPayload {
  return {
    leadId: input.leadId,
    type: input.type,
    fileName: `${input.leadId}-${input.type}.json`,
    contentType: "application/json",
    body: JSON.stringify({
      leadId: input.leadId,
      type: input.type,
      data: input.data,
      createdAt: new Date().toISOString(),
    }),
  };
}

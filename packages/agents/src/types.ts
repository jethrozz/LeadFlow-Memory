import type { StoredWalrusArtifact } from "@leadflow/walrus";

export type WorkflowServices = {
  llm: import("@leadflow/llm").LlmProvider;
  memwal: import("@leadflow/memwal").MemWalClient;
  walrus: import("@leadflow/walrus").WalrusArtifactClient;
};

export type DiscoveryInput = {
  leadId: string;
  memorySpaceId: string;
  sourceText: string;
};

export type DiscoveryResult = {
  intentLevel: string;
  summary: string;
  memoryRef: string;
  artifact: StoredWalrusArtifact;
};

export type ConversionInput = {
  leadId: string;
  memorySpaceId: string;
  customerMessage: string;
};

export type ConversionResult = {
  message: string;
  memoryRef: string;
  artifact: StoredWalrusArtifact;
  extractedFields: Record<string, unknown>;
};

export type HandoffRecoveryInput = {
  leadId: string;
  memorySpaceId: string;
  fromWorkerId: string;
  toWorkerId: string;
};

export type HandoffRecoveryResult = {
  recoverySummary: string;
  artifact: StoredWalrusArtifact;
};

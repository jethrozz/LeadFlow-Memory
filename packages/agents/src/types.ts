import type { StoredWalrusArtifact } from "@leadflow/walrus";
import type { XhsDiscoveryClient } from "@leadflow/connectors";

export type WorkflowServices = {
  llm: import("@leadflow/llm").LlmProvider;
  memwal: import("@leadflow/memwal").MemWalClient;
  walrus: import("@leadflow/walrus").WalrusArtifactClient;
  xhsDiscovery?: XhsDiscoveryClient;
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

export type CampaignDiscoveryInput = {
  campaignId: string;
  seedKeywords: string[];
  maxPostsPerRun?: number;
  maxCommentsPerPost?: number;
  delayMs?: number;
};

export type CampaignDiscoveryResult = {
  campaignId: string;
  searched: number;
  relevant: number;
  leadsCreated: number;
  skipped: number;
  artifacts: string[];
};

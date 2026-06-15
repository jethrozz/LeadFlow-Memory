import type { ConversionPlaybook } from "@leadflow/playbook";
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
  /** 剧本配置，用于动态生成发现 prompt 的抽取字段。不传则使用默认房产字段。 */
  playbook?: ConversionPlaybook;
};

export type DiscoveryResult = {
  intentLevel: string;
  summary: string;
  memoryRef: string;
  artifact: StoredWalrusArtifact;
  extractedFields: Record<string, unknown>;
  needs: string[];
  concerns: string[];
};

export type ConversionOutcome = "continue" | "goal_reached" | "rejected";

export type ConversionInput = {
  leadId: string;
  memorySpaceId: string;
  customerMessage?: string; // absence = opening mode (first touch)
  playbook?: ConversionPlaybook;
};

export type ConversionResult = {
  message: string;
  memoryRef: string;
  artifact: StoredWalrusArtifact;
  extractedFields: Record<string, unknown>;
  outcome: ConversionOutcome;
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
  /** 目标制：采集到多少条合格线索后停止（0 = 不限制，跑完 maxPosts 为止）。 */
  targetLeadCount?: number;
  /** 已有线索的 externalId 集合，用于跨运行去重，跳过已存在的线索。 */
  existingLeadExternalIds?: Set<string>;
  /** 剧本配置，用于动态生成发现 prompt 的抽取字段。 */
  playbook?: ConversionPlaybook;
  /** 每发现一条合格线索后的进度回调，用于更新 WorkflowRun metadata。 */
  onProgress?: (progress: {
    searched: number;
    relevant: number;
    leadsCreated: number;
    skipped: number;
  }) => void;
};

// 单条被发现的线索明细，供 API 层写入 store（agents 包不直接依赖 store）。
export type DiscoveredCampaignLead = {
  leadId: string;
  memorySpaceId: string;
  platform: "xhs";
  displayName: string;
  authorUserId?: string;
  authorRedId?: string;
  sourceType: "post" | "comment";
  sourceText: string;
  intentLevel: string;
  summary: string;
  extractedFields: Record<string, unknown>;
  needs: string[];
  concerns: string[];
  memoryRef: string;
  sourceArtifactBlobId: string;
  reportArtifactBlobId: string;
};

export type CampaignDiscoveryResult = {
  campaignId: string;
  searched: number;
  relevant: number;
  leadsCreated: number;
  skipped: number;
  artifacts: string[];
  leads: DiscoveredCampaignLead[];
};

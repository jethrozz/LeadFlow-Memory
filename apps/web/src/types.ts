export type DashboardLeadItem = {
  id: string;
  displayName: string;
  platform: string;
  intentLevel: string;
  status: string;
  summary: string;
  updatedAt: string;
  isDemoSeed?: boolean;
  district?: string;
  needs?: string[];
};

export type ProfileField = { label: string; value: string; confidence?: number };

export type ConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  sentAt: string;
};

export type TimelineEvent = {
  id: string;
  type: string;
  summary: string;
  agentName?: string;
  workerId?: string;
  memoryRefs: string[];
  artifactRefs: string[];
  createdAt: string;
};

export type MemoryRefItem = {
  id: string;
  memoryId: string;
  kind: string;
  summary: string;
  confidence?: number;
  createdAt: string;
};

export type ArtifactRefItem = {
  id: string;
  artifactType: string;
  blobId: string;
  summary?: string;
  createdAt: string;
};

export type NextFollowup = {
  message: string;
  usedMemoryRefs: string[];
  worker?: string;
  nextBestAction?: string;
  requiresHumanApproval?: boolean;
};

export type DashboardLeadDetail = {
  lead: DashboardLeadItem;
  profile: {
    summary: string;
    sourceNote?: string;
    needs: string[];
    concerns: string[];
    fields: Record<string, ProfileField>;
  };
  conversation: { messages: ConversationMessage[] };
  timeline: TimelineEvent[];
  memories: MemoryRefItem[];
  artifacts: ArtifactRefItem[];
  nextFollowup: NextFollowup | null;
};

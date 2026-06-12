export type DashboardLeadItem = {
  id: string;
  displayName: string;
  platform: string;
  intentLevel: string;
  status: string;
  summary: string;
  updatedAt: string;
};

export type DashboardLeadDetail = {
  lead: DashboardLeadItem;
  profile: {
    summary: string;
    fields: Record<string, { label: string; value: string; confidence: number }>;
  };
  timeline: Array<{
    id: string;
    type: string;
    summary: string;
    createdAt: string;
    memoryRefs: string[];
    artifactRefs: string[];
  }>;
  memories: Array<{ id: string; content: string; confidence: number; updatedAt: string }>;
  artifacts: Array<{ id: string; type: string; blobId: string; createdAt: string }>;
  nextFollowup: string;
};

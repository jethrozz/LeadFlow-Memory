export type MemorySource = "discovery" | "conversion" | "handoff" | "manual";

export type WriteMemoryInput = {
  leadId: string;
  memorySpaceId: string;
  content: string;
  metadata: {
    source: MemorySource;
    confidence: number;
    artifactRefs: string[];
  };
};

export type LeadMemory = {
  id: string;
  leadId: string;
  memorySpaceId: string;
  content: string;
  metadata: WriteMemoryInput["metadata"];
  createdAt: string;
};

export type RecallMemoryInput = {
  leadId: string;
  memorySpaceId: string;
  query: string;
  limit: number;
};

export type MemWalClient = {
  writeMemory(input: WriteMemoryInput): Promise<LeadMemory>;
  recall(input: RecallMemoryInput): Promise<LeadMemory[]>;
};

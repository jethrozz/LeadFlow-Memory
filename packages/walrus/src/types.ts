export type WalrusArtifactType =
  | "source_snapshot"
  | "lead_discovery_report"
  | "conversation_log"
  | "conversion_decision"
  | "memory_diff"
  | "followup_report"
  | "handoff_proof";

export type WalrusArtifactPayload = {
  leadId: string;
  type: WalrusArtifactType;
  fileName: string;
  contentType: "application/json";
  body: string;
};

export type StoredWalrusArtifact = {
  id: string;
  leadId: string;
  type: WalrusArtifactType;
  blobId: string;
  suiObjectId?: string;
  fileName: string;
  contentType: "application/json";
  sizeBytes: number;
  storedAt: string;
};

export type WalrusArtifactClient = {
  store(payload: WalrusArtifactPayload): Promise<StoredWalrusArtifact>;
  read(blobId: string): Promise<WalrusArtifactPayload>;
};

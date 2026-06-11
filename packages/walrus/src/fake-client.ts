import type {
  StoredWalrusArtifact,
  WalrusArtifactClient,
  WalrusArtifactPayload,
} from "./types.js";

export class FakeWalrusArtifactClient implements WalrusArtifactClient {
  private readonly payloads = new Map<string, WalrusArtifactPayload>();
  private sequence = 0;

  async store(payload: WalrusArtifactPayload): Promise<StoredWalrusArtifact> {
    this.sequence += 1;
    const blobId = `fake_blob_${this.sequence.toString().padStart(4, "0")}`;
    this.payloads.set(blobId, payload);

    return {
      id: `artifact_${this.sequence.toString().padStart(4, "0")}`,
      leadId: payload.leadId,
      type: payload.type,
      blobId,
      fileName: payload.fileName,
      contentType: payload.contentType,
      sizeBytes: Buffer.byteLength(payload.body),
      storedAt: new Date().toISOString(),
    };
  }

  async read(blobId: string): Promise<WalrusArtifactPayload> {
    const payload = this.payloads.get(blobId);
    if (!payload) {
      throw new Error(`Walrus artifact not found: ${blobId}`);
    }
    return payload;
  }
}

import type {
  StoredWalrusArtifact,
  WalrusArtifactClient,
  WalrusArtifactPayload,
} from "./types.js";

type WalrusHttpClientOptions = {
  publisherUrl: string;
  aggregatorUrl: string;
};

export class WalrusHttpArtifactClient implements WalrusArtifactClient {
  constructor(private readonly options: WalrusHttpClientOptions) {}

  async store(payload: WalrusArtifactPayload): Promise<StoredWalrusArtifact> {
    const response = await fetch(`${this.options.publisherUrl}/v1/blobs`, {
      method: "PUT",
      headers: { "content-type": payload.contentType },
      body: payload.body,
    });

    if (!response.ok) {
      throw new Error(`Walrus upload failed with status ${response.status}`);
    }

    const json = (await response.json()) as {
      newlyCreated?: { blobObject?: { blobId?: string; id?: string } };
      alreadyCertified?: { blobId?: string; event?: { blobId?: string } };
    };

    const blobId =
      json.newlyCreated?.blobObject?.blobId ??
      json.alreadyCertified?.blobId ??
      json.alreadyCertified?.event?.blobId;

    if (!blobId) {
      throw new Error("Walrus upload response did not include blobId");
    }

    return {
      id: `artifact_${blobId}`,
      leadId: payload.leadId,
      type: payload.type,
      blobId,
      suiObjectId: json.newlyCreated?.blobObject?.id,
      fileName: payload.fileName,
      contentType: payload.contentType,
      sizeBytes: Buffer.byteLength(payload.body),
      storedAt: new Date().toISOString(),
    };
  }

  async read(blobId: string): Promise<WalrusArtifactPayload> {
    const response = await fetch(`${this.options.aggregatorUrl}/v1/blobs/${blobId}`);
    if (!response.ok) {
      throw new Error(`Walrus read failed with status ${response.status}`);
    }
    const body = await response.text();
    const parsed = JSON.parse(body) as { leadId: string; type: WalrusArtifactPayload["type"] };

    return {
      leadId: parsed.leadId,
      type: parsed.type,
      fileName: `${parsed.leadId}-${parsed.type}.json`,
      contentType: "application/json",
      body,
    };
  }
}

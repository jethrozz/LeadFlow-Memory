import { describe, expect, it } from "vitest";
import { createArtifactPayload, FakeWalrusArtifactClient, createWalrusClientFromEnv } from "./index.js";

describe("Walrus artifacts", () => {
  it("creates deterministic JSON artifact payloads", () => {
    const payload = createArtifactPayload({
      leadId: "lead_001",
      type: "conversation_log",
      data: { messages: [{ role: "customer", text: "预算 130 万以内" }] },
    });

    expect(payload.fileName).toBe("lead_001-conversation_log.json");
    expect(payload.contentType).toBe("application/json");
    expect(payload.body).toContain("\"leadId\":\"lead_001\"");
  });

  it("stores and reads an artifact through the fake client", async () => {
    const client = new FakeWalrusArtifactClient();
    const payload = createArtifactPayload({
      leadId: "lead_001",
      type: "handoff_proof",
      data: { recoveredBy: "worker-2" },
    });

    const stored = await client.store(payload);
    const loaded = await client.read(stored.blobId);

    expect(stored.blobId).toMatch(/^fake_blob_/);
    expect(loaded.body).toBe(payload.body);
  });
});

describe("Walrus client configuration", () => {
  it("uses fake client when WALRUS_MODE=fake", () => {
    const client = createWalrusClientFromEnv({ WALRUS_MODE: "fake" });
    expect(client).toBeInstanceOf(FakeWalrusArtifactClient);
  });
});

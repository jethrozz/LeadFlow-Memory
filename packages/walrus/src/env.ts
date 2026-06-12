import { WalrusHttpArtifactClient } from "./client.js";
import { FakeWalrusArtifactClient } from "./fake-client.js";
import type { WalrusArtifactClient } from "./types.js";

export type WalrusEnv = {
  WALRUS_MODE?: string;
  WALRUS_PUBLISHER_URL?: string;
  WALRUS_AGGREGATOR_URL?: string;
};

export function createWalrusClientFromEnv(env: WalrusEnv = process.env): WalrusArtifactClient {
  if (env.WALRUS_MODE === "fake") {
    return new FakeWalrusArtifactClient();
  }

  if (!env.WALRUS_PUBLISHER_URL || !env.WALRUS_AGGREGATOR_URL) {
    throw new Error("Set WALRUS_MODE=fake or provide WALRUS_PUBLISHER_URL and WALRUS_AGGREGATOR_URL");
  }

  return new WalrusHttpArtifactClient({
    publisherUrl: env.WALRUS_PUBLISHER_URL,
    aggregatorUrl: env.WALRUS_AGGREGATOR_URL,
  });
}

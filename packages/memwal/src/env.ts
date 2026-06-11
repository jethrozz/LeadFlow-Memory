import { MemWalHttpClient } from "./client.js";
import { FakeMemWalClient } from "./fake-client.js";
import type { MemWalClient } from "./types.js";

export type MemWalEnv = {
  MEMWAL_MODE?: string;
  MEMWAL_BASE_URL?: string;
  MEMWAL_DELEGATE_KEY?: string;
};

export function createMemWalClientFromEnv(env: MemWalEnv = process.env): MemWalClient {
  if (env.MEMWAL_MODE === "fake") {
    return new FakeMemWalClient();
  }

  if (!env.MEMWAL_BASE_URL || !env.MEMWAL_DELEGATE_KEY) {
    throw new Error("Set MEMWAL_MODE=fake or provide MEMWAL_BASE_URL and MEMWAL_DELEGATE_KEY");
  }

  return new MemWalHttpClient({
    baseUrl: env.MEMWAL_BASE_URL,
    delegateKey: env.MEMWAL_DELEGATE_KEY,
  });
}

import { MemWalSdkClient } from "./client.js";
import { FakeMemWalClient } from "./fake-client.js";
import type { MemWalClient } from "./types.js";

export type MemWalEnv = {
  MEMWAL_MODE?: string;
  MEMWAL_BASE_URL?: string;
  MEMWAL_DELEGATE_KEY?: string;
  MEMWAL_ACCOUNT_ID?: string;
};

export function createMemWalClientFromEnv(env: MemWalEnv = process.env): MemWalClient {
  if (env.MEMWAL_MODE === "fake") {
    return new FakeMemWalClient();
  }

  if (!env.MEMWAL_BASE_URL || !env.MEMWAL_DELEGATE_KEY || !env.MEMWAL_ACCOUNT_ID) {
    throw new Error(
      "Set MEMWAL_MODE=fake or provide MEMWAL_BASE_URL, MEMWAL_DELEGATE_KEY, and MEMWAL_ACCOUNT_ID",
    );
  }

  return new MemWalSdkClient({
    baseUrl: env.MEMWAL_BASE_URL,
    delegateKey: env.MEMWAL_DELEGATE_KEY,
    accountId: env.MEMWAL_ACCOUNT_ID,
  });
}

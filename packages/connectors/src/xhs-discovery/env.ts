import { FakeXhsDiscoveryClient } from "./fake-client.js";
import { XhsDiscoveryMcpClient } from "./mcp-client.js";
import type { XhsDiscoveryClient } from "./types.js";

export type XhsDiscoveryEnv = {
  XHS_DISCOVERY_MODE?: string;
  XHS_DISCOVERY_MCP_URL?: string;
};

export function createXhsDiscoveryClientFromEnv(
  env: XhsDiscoveryEnv = process.env,
): XhsDiscoveryClient {
  if (env.XHS_DISCOVERY_MODE === "fake") {
    return new FakeXhsDiscoveryClient();
  }
  if (!env.XHS_DISCOVERY_MCP_URL) {
    throw new Error(
      "Set XHS_DISCOVERY_MODE=fake or provide XHS_DISCOVERY_MCP_URL (e.g. http://localhost:18060/mcp)",
    );
  }
  return new XhsDiscoveryMcpClient({ baseUrl: env.XHS_DISCOVERY_MCP_URL });
}

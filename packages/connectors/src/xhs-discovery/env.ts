import { FakeXhsDiscoveryClient } from "./fake-client.js";
import { XhsDiscoveryMcpClient } from "./mcp-client.js";
import type { XhsDiscoveryClient } from "./types.js";

export type XhsDiscoveryEnv = {
  XHS_DISCOVERY_MODE?: string;
  XHS_DISCOVERY_MCP_URL?: string;
  /** 单次 MCP 工具调用超时（毫秒）。user_profile 等抓取很慢，默认 120000。 */
  XHS_DISCOVERY_TIMEOUT_MS?: string;
  /** 传输/超时失败的最大重试次数，默认 2。 */
  XHS_DISCOVERY_MAX_RETRIES?: string;
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
  return new XhsDiscoveryMcpClient({
    baseUrl: env.XHS_DISCOVERY_MCP_URL,
    callTimeoutMs: env.XHS_DISCOVERY_TIMEOUT_MS ? Number(env.XHS_DISCOVERY_TIMEOUT_MS) : undefined,
    maxRetries: env.XHS_DISCOVERY_MAX_RETRIES ? Number(env.XHS_DISCOVERY_MAX_RETRIES) : undefined,
  });
}

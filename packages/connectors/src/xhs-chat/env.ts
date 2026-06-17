import { FakeXhsChatClient } from "./fake-client.js";
import { XhsMcpStdioClient } from "./mcp-client.js";
import { XhsMidsceneClient } from "./midscene-client.js";
import { loadMidsceneConfig } from "./midscene/device.js";
import type { XhsChatClient } from "./types.js";

export type XhsChatEnv = {
  XHS_CHAT_MODE?: string;
  // legacy MCP（stdio 子进程）模式参数
  XHS_CHAT_COMMAND?: string;
  XHS_CHAT_CWD?: string;
  XHS_CHAT_TIMEOUT_MS?: string;
  XHS_CHAT_MAX_RETRIES?: string;
  // 进程内 Midscene 模式参数
  MIDSCENE_MODEL_API_KEY?: string;
  MIDSCENE_MODEL_NAME?: string;
  MIDSCENE_MODEL_BASE_URL?: string;
  MIDSCENE_MODEL_FAMILY?: string;
};

export function createXhsChatClientFromEnv(env: XhsChatEnv = process.env): XhsChatClient {
  if (env.XHS_CHAT_MODE === "fake") {
    return new FakeXhsChatClient();
  }

  // legacy：仍想用外部 mcp-xhs-chat 子进程时，显式 XHS_CHAT_MODE=mcp。
  if (env.XHS_CHAT_MODE === "mcp") {
    if (!env.XHS_CHAT_COMMAND || !env.XHS_CHAT_CWD) {
      throw new Error("XHS_CHAT_MODE=mcp requires XHS_CHAT_COMMAND and XHS_CHAT_CWD");
    }
    const [command, ...args] = env.XHS_CHAT_COMMAND.split(/\s+/);
    return new XhsMcpStdioClient({
      command,
      args,
      cwd: env.XHS_CHAT_CWD,
      callTimeoutMs: env.XHS_CHAT_TIMEOUT_MS ? Number(env.XHS_CHAT_TIMEOUT_MS) : undefined,
      maxRetries: env.XHS_CHAT_MAX_RETRIES ? Number(env.XHS_CHAT_MAX_RETRIES) : undefined,
    });
  }

  // 默认：进程内 Midscene 客户端，直接驱动 ADB 真机。
  return new XhsMidsceneClient({ config: loadMidsceneConfig(env as NodeJS.ProcessEnv) });
}

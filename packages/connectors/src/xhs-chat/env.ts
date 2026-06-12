import { FakeXhsChatClient } from "./fake-client.js";
import { XhsMcpStdioClient } from "./mcp-client.js";
import type { XhsChatClient } from "./types.js";

export type XhsChatEnv = {
  XHS_CHAT_MODE?: string;
  XHS_CHAT_COMMAND?: string;
  XHS_CHAT_CWD?: string;
};

export function createXhsChatClientFromEnv(env: XhsChatEnv = process.env): XhsChatClient {
  if (env.XHS_CHAT_MODE === "fake") {
    return new FakeXhsChatClient();
  }

  if (!env.XHS_CHAT_COMMAND || !env.XHS_CHAT_CWD) {
    throw new Error("Set XHS_CHAT_MODE=fake or provide XHS_CHAT_COMMAND and XHS_CHAT_CWD");
  }

  const [command, ...args] = env.XHS_CHAT_COMMAND.split(/\s+/);

  return new XhsMcpStdioClient({
    command,
    args,
    cwd: env.XHS_CHAT_CWD,
  });
}

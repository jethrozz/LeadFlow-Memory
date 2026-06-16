// 真机冒烟：经连接器 → mcp-xhs-chat（stdio）→ adb 给指定用户发私信。
// 用法：node scripts/smoke-xhs-send.mjs [deviceId] [xhsUserId] [xhsUsername] [message]
// 默认：b759b4fa / jethrozz / jethrozz / 测试消息
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XhsMcpStdioClient } from "../packages/connectors/dist/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..");

const deviceId = process.argv[2] || "b759b4fa";
const xhsUserId = process.argv[3] || "jethrozz";
const xhsUsername = process.argv[4] || "jethrozz";
const message =
  process.argv[5] ||
  `LeadFlow 对接测试 ${new Date().toLocaleTimeString("zh-CN")}，看到请回复一下～`;

const client = new XhsMcpStdioClient({
  command: "node",
  args: ["dist/index.js"],
  cwd: resolve(repoRoot, "mcp-xhs-chat"),
});

console.log(`[smoke] 发送中 → device=${deviceId} user=${xhsUserId} (${xhsUsername})`);
console.log(`[smoke] message="${message}"`);

try {
  const result = await client.sendPrivateMessage({ deviceId, xhsUserId, xhsUsername, message });
  console.log("[smoke] ✅ 发送结果:", JSON.stringify(result));
} catch (err) {
  console.error("[smoke] ❌ 发送失败:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.close();
}

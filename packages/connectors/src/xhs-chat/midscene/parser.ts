// 从 mcp-xhs-chat/src/xhs/parser.ts 移植，只保留实际被调用的逻辑：
// extractChatContent（aiQuery 结构化提取）+ normalizeTime。
// 原文件里 AutoGLM 时代的 parseAutoGlmThought / parseFromErrorMessage /
// parseFlexibly / parseElementsToMessages / parseAiActResult 等均已不被调用，丢弃。
import type { ChatMessage } from "./errors.js";
import { createToolLogger } from "./logger.js";

const logger = createToolLogger("xhs-parser");

function normalizeTime(time: string): string {
  // 空/无时间：直接用当前时间，避免拼出 "2026-06-16T:00Z" 这种非法串。
  const t = (time ?? "").trim();
  if (!t) return new Date().toISOString();

  // 已是 ISO
  if (t.includes("T") && (t.includes("Z") || t.includes("+"))) {
    return t;
  }

  // 形如 "10:00" → 今天的该时刻；只接受 HH:MM，其它一律回退当前时间。
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const today = new Date().toISOString().split("T")[0];
    return `${today}T${t}:00Z`;
  }
  return new Date().toISOString();
}

interface AndroidAgentInterface {
  aiQuery: (demand: string) => Promise<unknown>;
}

export interface ExtractResult {
  raw_content: string;
  messages: ChatMessage[];
}

/**
 * 用 aiQuery 直接结构化提取当前聊天界面的消息。
 * 旧实现用 aiAct + 解析 dump thought（为 auto-glm 设计），qwen3-vl 下读不出来（rawContent 为空）。
 * aiQuery 是 VL 结构化抽取，可靠很多。
 */
export async function extractChatContent(agent: unknown): Promise<ExtractResult> {
  const midsceneAgent = agent as AndroidAgentInterface;

  logger.info("Extracting chat content via aiQuery");

  try {
    const demand =
      "{messages: Array<{speaker: string, content: string, time: string}>} " +
      "提取当前小红书私信聊天界面上所有可见的聊天消息气泡，按从上到下的顺序。" +
      "判断 speaker：靠屏幕【右侧】、气泡是【蓝色/彩色】背景的是\"我\"（当前登录账号自己发的）；" +
      "靠屏幕【左侧】、气泡是【白色或浅灰】背景、左边带对方头像的是\"对方\"（客户发的）。请严格按气泡的左右位置和颜色判断，不要弄反。" +
      "content 是消息文字；time 是消息时间（界面没有则空串）。" +
      "只提取真实对话气泡，忽略系统提示、日期分隔、以及分享的笔记卡片。没有任何消息则 messages 为空数组。";

    const result = (await midsceneAgent.aiQuery(demand)) as
      | { messages?: Array<{ speaker?: unknown; content?: unknown; time?: unknown }> }
      | undefined;

    const rawList = Array.isArray(result?.messages) ? result!.messages! : [];
    const messages: ChatMessage[] = rawList
      .filter((m) => m && typeof m.content === "string" && (m.content as string).trim())
      .map((m) => ({
        from: m.speaker === "我" || m.speaker === "me" ? "me" : "them",
        content: (m.content as string).trim(),
        time: normalizeTime(typeof m.time === "string" ? m.time : ""),
      }));

    logger.info({ messageCount: messages.length }, "Extracted messages via aiQuery");
    // raw_content 保留结构化结果的 JSON，便于排查；调用方优先用 messages。
    return { raw_content: JSON.stringify(rawList), messages };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "Failed to extract chat content");
    return { raw_content: "", messages: [] };
  }
}

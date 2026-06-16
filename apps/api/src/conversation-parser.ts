import type { LlmProvider } from "@leadflow/llm";

export type ParsedConversationMessage = {
  direction: "inbound" | "outbound";
  content: string;
  sentAt: string;
};

const SYSTEM_PROMPT = [
  "你是小红书聊天记录解析器。输入是从手机屏幕提取的原始文本（可能含 AI 描述、序号、时间、引号等噪声）。",
  "请抽取出按时间先后排列的聊天消息，只保留真实对话内容，忽略系统提示（如“已相互关注”）和非消息文本。",
  '返回 JSON：{ "messages": [{ "speaker": "me" | "them", "content": "消息文本", "time": "原始时间字符串，没有则空串" }] }',
  '"me" 表示账号本人（我）发出的消息，"them" 表示对方（客户）发出的消息。',
  "若无法识别任何消息，返回 { \"messages\": [] }。",
].join("\n");

type RawParsed = {
  messages?: Array<{ speaker?: unknown; content?: unknown; time?: unknown }>;
};

/**
 * 用 LLM 把 mcp-xhs-chat 返回的 raw_content 重解析成结构化消息。
 * server 端正则解析不可靠，故在 LeadFlow 侧用 LLM 兜底。
 */
export async function parseRawConversation(
  llm: LlmProvider,
  rawContent: string,
): Promise<ParsedConversationMessage[]> {
  const result = (await llm.chatJson({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: rawContent }],
  })) as RawParsed;

  if (!Array.isArray(result.messages)) return [];

  const parsed: ParsedConversationMessage[] = [];
  for (const msg of result.messages) {
    const content = typeof msg.content === "string" ? msg.content.trim() : "";
    if (!content) continue;
    const direction = msg.speaker === "me" ? "outbound" : "inbound";
    const sentAt = typeof msg.time === "string" && msg.time.trim() ? msg.time.trim() : new Date().toISOString();
    parsed.push({ direction, content, sentAt });
  }
  return parsed;
}

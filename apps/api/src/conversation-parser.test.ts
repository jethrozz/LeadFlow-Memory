import { describe, expect, it } from "vitest";
import { FakeLlmProvider } from "@leadflow/llm";
import { parseRawConversation } from "./conversation-parser.js";

describe("parseRawConversation", () => {
  it("把 LLM 解析出的 speaker 映射成 direction", async () => {
    const llm = new FakeLlmProvider({
      content: JSON.stringify({
        messages: [
          { speaker: "them", content: "想看渝北三房", time: "10:00" },
          { speaker: "me", content: "好的，我整理给您", time: "10:01" },
        ],
      }),
    });
    const result = await parseRawConversation(llm, "原始屏幕文本");
    expect(result).toEqual([
      { direction: "inbound", content: "想看渝北三房", sentAt: "10:00" },
      { direction: "outbound", content: "好的，我整理给您", sentAt: "10:01" },
    ]);
  });

  it("跳过空内容，无 messages 时返回空数组", async () => {
    const llm = new FakeLlmProvider({
      content: JSON.stringify({ messages: [{ speaker: "them", content: "  " }] }),
    });
    expect(await parseRawConversation(llm, "x")).toEqual([]);

    const empty = new FakeLlmProvider({ content: JSON.stringify({}) });
    expect(await parseRawConversation(empty, "x")).toEqual([]);
  });
});

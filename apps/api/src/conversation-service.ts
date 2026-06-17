import type { ApiServices } from "./app.js";
import { parseRawConversation, type ParsedConversationMessage } from "./conversation-parser.js";

type Identity = { leadId: string; deviceId: string; xhsUserId?: string; xhsUsername?: string };

export async function sendFollowup(
  services: ApiServices,
  input: Identity & { message: string },
): Promise<{ status: string; remoteMessageId?: string; sentAt: string }> {
  const result = await services.xhsChat.sendPrivateMessage({
    deviceId: input.deviceId,
    xhsUserId: input.xhsUserId,
    xhsUsername: input.xhsUsername,
    message: input.message,
  });
  await services.store.appendConversationMessage(input.leadId, {
    direction: "outbound",
    content: input.message,
    sentAt: result.sentAt,
  });
  await services.store.appendTimelineEvent({
    leadId: input.leadId,
    type: "agent_replied",
    summary: `Agent 发送跟进消息：${input.message.slice(0, 50)}`,
    agentName: "conversion",
    memoryRefs: [],
    artifactRefs: [],
  });
  return result;
}

export async function syncConversation(
  services: ApiServices,
  input: Identity & { sinceTime?: string },
): Promise<{ newInboundCount: number; lastInboundContent?: string }> {
  const existing = await services.store.listConversationMessages(input.leadId);
  // 按「内容」去重（不带 direction/时间）：VL 读屏常把我方右侧气泡误判成对方，
  // 若按 direction+时间去重会让 agent 把自己发过、已入库的消息当成新回复，导致自言自语刷屏。
  // 归一化去掉空格+标点（容忍 VL 把全/半角标点、结尾句号读得不一致），只要内容已入库就跳过。
  const norm = (c: string) =>
    c.replace(/[\s，。！？、；：,.!?;:~…·、""''「」『』（）()【】\[\]-]/g, "");
  const seen = new Set(existing.map((m) => norm(m.content)));
  const sinceTime =
    input.sinceTime ?? (existing.length ? existing[existing.length - 1].sentAt : undefined);

  const fetched = await services.xhsChat.getConversation({
    deviceId: input.deviceId,
    xhsUserId: input.xhsUserId,
    xhsUsername: input.xhsUsername,
    sinceTime,
  });

  // 优先用 server 结构化 messages（aiQuery 抽取，可靠）；为空再退回 LLM 解析 rawContent。
  let messages: ParsedConversationMessage[];
  if (fetched.messages.length > 0) {
    messages = fetched.messages.map((m) => ({
      direction: m.direction,
      content: m.content,
      sentAt: m.sentAt,
    }));
  } else if (fetched.rawContent && fetched.rawContent.trim()) {
    messages = await parseRawConversation(services.llm, fetched.rawContent);
  } else {
    messages = [];
  }

  let newInboundCount = 0;
  let lastInboundContent: string | undefined;
  for (const msg of messages) {
    const key = norm(msg.content);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    await services.store.appendConversationMessage(input.leadId, {
      direction: msg.direction,
      content: msg.content,
      sentAt: msg.sentAt,
    });
    if (msg.direction === "inbound") {
      newInboundCount++;
      lastInboundContent = msg.content;
    }
  }
  return { newInboundCount, lastInboundContent };
}

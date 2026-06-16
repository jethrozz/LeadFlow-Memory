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
  const seen = new Set(existing.map((m) => `${m.direction}|${m.sentAt}|${m.content}`));
  const sinceTime =
    input.sinceTime ?? (existing.length ? existing[existing.length - 1].sentAt : undefined);

  const fetched = await services.xhsChat.getConversation({
    deviceId: input.deviceId,
    xhsUserId: input.xhsUserId,
    xhsUsername: input.xhsUsername,
    sinceTime,
  });

  // 有 rawContent（真实 server）优先用 LLM 重解析；否则用 server best-effort messages（fake/回退）。
  let messages: ParsedConversationMessage[];
  if (fetched.rawContent && fetched.rawContent.trim()) {
    messages = await parseRawConversation(services.llm, fetched.rawContent);
  } else {
    messages = fetched.messages.map((m) => ({
      direction: m.direction,
      content: m.content,
      sentAt: m.sentAt,
    }));
  }

  let newInboundCount = 0;
  let lastInboundContent: string | undefined;
  for (const msg of messages) {
    const key = `${msg.direction}|${msg.sentAt}|${msg.content}`;
    if (seen.has(key)) continue;
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

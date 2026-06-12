import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const XhsIdentityBodySchema = z.object({
  deviceId: z.string(),
  xhsUserId: z.string().optional(),
  xhsUsername: z.string().optional(),
  sinceTime: z.string().optional(),
});

const SendBodySchema = XhsIdentityBodySchema.extend({
  message: z.string().min(1),
});

export function conversationsRoute(services: ApiServices) {
  const route = new Hono();

  route.get("/:leadId/conversation", (c) => {
    const leadId = c.req.param("leadId");
    return c.json({
      leadId,
      messages: services.store.listConversationMessages(leadId),
    });
  });

  route.post("/:leadId/conversation/sync", async (c) => {
    const leadId = c.req.param("leadId");
    const body = XhsIdentityBodySchema.parse(await c.req.json());
    const messages = await services.xhsChat.getConversation(body);

    let hasNewInbound = false;
    for (const msg of messages) {
      const direction = (msg.direction ?? "inbound") as "inbound" | "outbound";
      services.store.appendConversationMessage(leadId, {
        direction,
        content: msg.content,
        sentAt: msg.sentAt ?? new Date().toISOString(),
      });
      if (direction === "inbound") {
        hasNewInbound = true;
      }
    }

    if (hasNewInbound) {
      services.store.appendTimelineEvent({
        leadId,
        type: "customer_replied",
        summary: "客户通过小红书回复了消息",
        agentName: "xhs_sync",
        memoryRefs: [],
        artifactRefs: [],
      });
    }

    return c.json({
      leadId,
      messages: services.store.listConversationMessages(leadId),
    });
  });

  route.post("/:leadId/conversation/send", async (c) => {
    const leadId = c.req.param("leadId");
    const body = SendBodySchema.parse(await c.req.json());
    const result = await services.xhsChat.sendPrivateMessage(body);

    services.store.appendConversationMessage(leadId, {
      direction: "outbound",
      content: body.message,
      sentAt: new Date().toISOString(),
    });
    services.store.appendTimelineEvent({
      leadId,
      type: "agent_replied",
      summary: `Agent 发送跟进消息：${body.message.slice(0, 50)}`,
      agentName: "conversion",
      memoryRefs: [],
      artifactRefs: [],
    });

    return c.json({
      leadId,
      ...result,
    });
  });

  route.post("/:leadId/conversation/customer-reply", async (c) => {
    const leadId = c.req.param("leadId");
    const body = z.object({ message: z.string().min(1) }).parse(await c.req.json());

    const msg = services.store.appendConversationMessage(leadId, {
      direction: "inbound",
      content: body.message,
      sentAt: new Date().toISOString(),
    });
    services.store.appendTimelineEvent({
      leadId,
      type: "customer_replied",
      summary: `客户回复（人工录入）：${body.message.slice(0, 50)}`,
      agentName: "manual",
      memoryRefs: [],
      artifactRefs: [],
    });

    return c.json({
      leadId,
      direction: msg.direction,
      content: msg.content,
      receivedAt: msg.sentAt,
    });
  });

  return route;
}

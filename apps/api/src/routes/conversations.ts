import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";
import { sendFollowup, syncConversation } from "../conversation-service.js";

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

  route.get("/:leadId/conversation", async (c) => {
    const leadId = c.req.param("leadId");
    const messages = await services.store.listConversationMessages(leadId);
    return c.json({ leadId, messages });
  });

  route.post("/:leadId/conversation/sync", async (c) => {
    const leadId = c.req.param("leadId");
    const body = XhsIdentityBodySchema.parse(await c.req.json());
    const { newInboundCount } = await syncConversation(services, {
      leadId,
      deviceId: body.deviceId,
      xhsUserId: body.xhsUserId,
      xhsUsername: body.xhsUsername,
      sinceTime: body.sinceTime,
    });
    if (newInboundCount > 0) {
      await services.store.appendTimelineEvent({
        leadId,
        type: "customer_replied",
        summary: "客户通过小红书回复了消息",
        agentName: "xhs_sync",
        memoryRefs: [],
        artifactRefs: [],
      });
    }
    const updatedMessages = await services.store.listConversationMessages(leadId);
    return c.json({ leadId, messages: updatedMessages });
  });

  route.post("/:leadId/conversation/send", async (c) => {
    const leadId = c.req.param("leadId");
    const body = SendBodySchema.parse(await c.req.json());
    const result = await sendFollowup(services, {
      leadId,
      deviceId: body.deviceId,
      xhsUserId: body.xhsUserId,
      xhsUsername: body.xhsUsername,
      message: body.message,
    });
    return c.json({ leadId, ...result });
  });

  route.post("/:leadId/conversation/customer-reply", async (c) => {
    const leadId = c.req.param("leadId");
    const body = z.object({ message: z.string().min(1) }).parse(await c.req.json());

    const msg = await services.store.appendConversationMessage(leadId, {
      direction: "inbound",
      content: body.message,
      sentAt: new Date().toISOString(),
    });
    await services.store.appendTimelineEvent({
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

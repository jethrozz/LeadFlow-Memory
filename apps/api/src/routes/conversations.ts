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

  route.get("/:leadId/conversation", (c) =>
    c.json({
      leadId: c.req.param("leadId"),
      messages: [],
    }),
  );

  route.post("/:leadId/conversation/sync", async (c) => {
    const body = XhsIdentityBodySchema.parse(await c.req.json());
    const messages = await services.xhsChat.getConversation(body);
    return c.json({
      leadId: c.req.param("leadId"),
      messages,
    });
  });

  route.post("/:leadId/conversation/send", async (c) => {
    const body = SendBodySchema.parse(await c.req.json());
    const result = await services.xhsChat.sendPrivateMessage(body);
    return c.json({
      leadId: c.req.param("leadId"),
      ...result,
    });
  });

  route.post("/:leadId/conversation/customer-reply", async (c) => {
    const body = z.object({ message: z.string().min(1) }).parse(await c.req.json());
    return c.json({
      leadId: c.req.param("leadId"),
      direction: "inbound",
      content: body.message,
      receivedAt: new Date().toISOString(),
    });
  });

  return route;
}

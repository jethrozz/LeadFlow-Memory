import { Hono } from "hono";
import { conversationChen } from "../fixtures/demo-data.js";

export const conversationsRoutes = new Hono();

conversationsRoutes.get("/:leadId/conversation", (c) => {
  if (c.req.param("leadId") !== conversationChen.leadId) {
    return c.json({ error: { code: "CONVERSATION_NOT_FOUND" } }, 404);
  }

  return c.json({ conversation: conversationChen });
});

conversationsRoutes.post("/:leadId/conversation/sync", (c) => {
  return c.json({
    channel: "mcp-xhs-chat",
    workflowRun: {
      id: "workflow_sync_queued",
      type: "conversion",
      status: "queued",
      leadId: c.req.param("leadId"),
    },
  }, 202);
});

conversationsRoutes.post("/:leadId/conversation/send", async (c) => {
  const body = await c.req.json();
  return c.json({
    channel: "mcp-xhs-chat",
    leadId: c.req.param("leadId"),
    message: body.message,
    status: "queued_for_send",
  }, 202);
});

conversationsRoutes.post("/:leadId/conversation/customer-reply", async (c) => {
  const body = await c.req.json();
  return c.json({
    leadId: c.req.param("leadId"),
    reply: body.content,
    status: "accepted",
  }, 202);
});

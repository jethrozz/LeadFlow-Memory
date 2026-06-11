import { Hono } from "hono";
import { z } from "zod";
import { conversationChen } from "../fixtures/demo-data.js";

export const conversationsRoutes = new Hono();

conversationsRoutes.get("/:leadId/conversation", (c) => {
  if (c.req.param("leadId") !== conversationChen.leadId) {
    return c.json({ error: { code: "CONVERSATION_NOT_FOUND", message: `Conversation for lead '${c.req.param("leadId")}' was not found.` } }, 404);
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

const sendMessageSchema = z.object({
  message: z.string().min(1),
});

conversationsRoutes.post("/:leadId/conversation/send", async (c) => {
  const parsed = sendMessageSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join("; ") } },
      400,
    );
  }
  return c.json({
    channel: "mcp-xhs-chat",
    leadId: c.req.param("leadId"),
    message: parsed.data.message,
    status: "queued_for_send",
  }, 202);
});

const customerReplySchema = z.object({
  content: z.string().min(1),
});

conversationsRoutes.post("/:leadId/conversation/customer-reply", async (c) => {
  const parsed = customerReplySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join("; ") } },
      400,
    );
  }
  return c.json({
    leadId: c.req.param("leadId"),
    reply: parsed.data.content,
    status: "accepted",
  }, 202);
});

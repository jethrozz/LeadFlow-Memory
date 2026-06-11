import { Hono } from "hono";
import { z } from "zod";

export const workflowsRoutes = new Hono();

const discoverySchema = z.object({
  campaignId: z.string().min(1),
});

workflowsRoutes.post("/discovery/run", async (c) => {
  const parsed = discoverySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join("; ") } },
      400,
    );
  }
  return c.json({ workflowRun: { id: "workflow_discovery_queued", type: "discovery", status: "queued", campaignId: parsed.data.campaignId } }, 202);
});

const conversionSchema = z.object({
  leadId: z.string().min(1),
});

workflowsRoutes.post("/conversion/run", async (c) => {
  const parsed = conversionSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join("; ") } },
      400,
    );
  }
  return c.json({ workflowRun: { id: "workflow_conversion_queued", type: "conversion", status: "queued", leadId: parsed.data.leadId, mode: undefined } }, 202);
});

const handoffSchema = z.object({
  leadId: z.string().min(1),
});

workflowsRoutes.post("/handoff/run", async (c) => {
  const parsed = handoffSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join("; ") } },
      400,
    );
  }
  return c.json({ workflowRun: { id: "workflow_handoff_queued", type: "handoff_recovery", status: "queued", leadId: parsed.data.leadId, reason: undefined } }, 202);
});

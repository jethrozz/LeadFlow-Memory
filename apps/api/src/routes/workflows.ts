import { Hono } from "hono";

export const workflowsRoutes = new Hono();

workflowsRoutes.post("/discovery/run", async (c) => {
  const body = await c.req.json();
  return c.json({ workflowRun: { id: "workflow_discovery_queued", type: "discovery", status: "queued", campaignId: body.campaignId } }, 202);
});

workflowsRoutes.post("/conversion/run", async (c) => {
  const body = await c.req.json();
  return c.json({ workflowRun: { id: "workflow_conversion_queued", type: "conversion", status: "queued", leadId: body.leadId, mode: body.mode } }, 202);
});

workflowsRoutes.post("/handoff/run", async (c) => {
  const body = await c.req.json();
  return c.json({ workflowRun: { id: "workflow_handoff_queued", type: "handoff_recovery", status: "queued", leadId: body.leadId, reason: body.reason } }, 202);
});

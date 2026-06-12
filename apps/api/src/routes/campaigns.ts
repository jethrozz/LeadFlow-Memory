import { Hono } from "hono";

export const campaignsRoutes = new Hono();

campaignsRoutes.get("/", (c) => c.json({ items: [] }));

campaignsRoutes.post("/", async (c) => {
  const body = await c.req.json();
  return c.json({ campaign: { id: "campaign_created", ...body, status: "draft" } }, 201);
});

campaignsRoutes.post("/:campaignId/run", (c) => {
  return c.json({
    workflowRun: {
      id: "workflow_discovery_queued",
      type: "discovery",
      status: "queued",
      campaignId: c.req.param("campaignId"),
    },
  }, 202);
});

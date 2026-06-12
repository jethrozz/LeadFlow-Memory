import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { ApiServices } from "../app.js";

export function campaignsRoutes(services: ApiServices) {
  const route = new Hono();

  route.get("/", (c) => {
    const items = [...services.store.campaigns.values()];
    return c.json({ items });
  });

  route.post("/", async (c) => {
    const body = await c.req.json();
    const campaign = {
      id: `campaign_${randomUUID()}`,
      status: "draft",
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    services.store.campaigns.set(campaign.id, campaign);
    return c.json(campaign, 201);
  });

  route.post("/:campaignId/run", (c) => {
    return c.json(
      {
        workflowRun: {
          id: "workflow_discovery_queued",
          type: "discovery",
          status: "queued",
          campaignId: c.req.param("campaignId"),
        },
      },
      202,
    );
  });

  return route;
}

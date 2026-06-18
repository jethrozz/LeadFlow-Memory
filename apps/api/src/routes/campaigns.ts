import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { ApiServices } from "../app.js";

export function campaignsRoutes(services: ApiServices) {
  const route = new Hono();

  route.get("/", async (c) => {
    const items = await services.store.listCampaigns();
    return c.json({ items });
  });

  route.post("/", async (c) => {
    const body = await c.req.json();
    const campaign = await services.store.upsertCampaign({
      id: `campaign_${randomUUID()}`,
      status: "draft",
      ...body,
    });
    return c.json(campaign, 201);
  });

  route.patch("/:campaignId", async (c) => {
    const campaignId = c.req.param("campaignId");
    const existing = await services.store.getCampaign(campaignId);
    if (!existing) {
      return c.json({ error: { code: "CAMPAIGN_NOT_FOUND" } }, 404);
    }
    const body = await c.req.json();
    const updated = await services.store.upsertCampaign({ ...existing, ...body, id: campaignId });
    return c.json(updated);
  });

  route.post("/:campaignId/run", async (c) => {
    const campaignId = c.req.param("campaignId");
    const campaign = await services.store.getCampaign(campaignId);
    if (!campaign) {
      return c.json({ error: { code: "CAMPAIGN_NOT_FOUND" } }, 404);
    }

    // 创建 WorkflowRun 记录
    const run = await services.store.createWorkflowRun({
      type: "discovery",
      campaignId,
      metadata: { triggeredBy: "manual", searched: 0, relevant: 0, leadsCreated: 0, skipped: 0 },
    });

    // 异步执行发现（不阻塞请求）
    const { triggerCampaignDiscovery } = await import("../scheduler.js");
    triggerCampaignDiscovery(services, campaign, run.id).catch((err) => {
      console.error(`[manual] Campaign ${campaignId} discovery failed:`, err);
    });

    return c.json({ workflowRun: { ...run, campaignId } }, 202);
  });

  route.get("/:campaignId/runs", async (c) => {
    const campaignId = c.req.param("campaignId");
    const runs = await services.store.listWorkflowRuns(campaignId);
    return c.json({ items: runs });
  });

  return route;
}

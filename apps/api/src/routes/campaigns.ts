import { Hono } from "hono";
import { z } from "zod";

export const campaignsRoutes = new Hono();

campaignsRoutes.get("/", (c) => c.json({ items: [] }));

const createCampaignSchema = z.object({
  name: z.string().min(1),
});

campaignsRoutes.post("/", async (c) => {
  const parsed = createCampaignSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => i.message).join("; ") } },
      400,
    );
  }
  return c.json({ campaign: { id: "campaign_created", ...parsed.data, status: "draft" } }, 201);
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

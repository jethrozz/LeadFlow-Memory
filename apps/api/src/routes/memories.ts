import { Hono } from "hono";
import { memoriesChen } from "../fixtures/demo-data.js";

export const memoriesRoutes = new Hono();

memoriesRoutes.get("/:leadId/memories", (c) => {
  return c.json({ leadId: c.req.param("leadId"), memories: memoriesChen });
});

memoriesRoutes.post("/:leadId/memories/recall", async (c) => {
  const body = await c.req.json();
  return c.json({
    leadId: c.req.param("leadId"),
    query: body.query,
    memories: memoriesChen.slice(0, body.limit ?? 8),
  });
});

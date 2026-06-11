import { Hono } from "hono";
import { artifactsChen } from "../fixtures/demo-data.js";

export const artifactsRoutes = new Hono();

artifactsRoutes.get("/:leadId/artifacts", (c) => {
  return c.json({ leadId: c.req.param("leadId"), artifacts: artifactsChen });
});

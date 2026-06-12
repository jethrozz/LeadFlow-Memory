import { Hono } from "hono";
import { z } from "zod";
import { createArtifactPayload } from "@leadflow/walrus";
import type { ApiServices } from "../app.js";

const StoreArtifactBodySchema = z.object({
  leadId: z.string(),
  type: z.enum([
    "source_snapshot",
    "lead_discovery_report",
    "conversation_log",
    "conversion_decision",
    "memory_diff",
    "followup_report",
    "handoff_proof",
  ]),
  data: z.unknown(),
});

export function artifactsRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/", async (c) => {
    const body = StoreArtifactBodySchema.parse(await c.req.json());
    const payload = createArtifactPayload({ ...body, data: body.data as unknown });
    const stored = await services.walrus.store(payload);
    return c.json(stored, 201);
  });

  route.get("/:blobId", async (c) => {
    const payload = await services.walrus.read(c.req.param("blobId"));
    return c.json(payload);
  });

  return route;
}

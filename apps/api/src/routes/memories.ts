import { Hono } from "hono";
import { z } from "zod";
import type { ApiServices } from "../app.js";

const WriteMemoryBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  content: z.string().min(1),
  metadata: z.object({
    source: z.enum(["discovery", "conversion", "handoff", "manual"]),
    confidence: z.number().min(0).max(1),
    artifactRefs: z.array(z.string()),
  }),
});

const RecallMemoryBodySchema = z.object({
  leadId: z.string(),
  memorySpaceId: z.string(),
  query: z.string(),
  limit: z.number().int().positive().max(20),
});

export function memoriesRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/", async (c) => {
    const body = WriteMemoryBodySchema.parse(await c.req.json());
    const memory = await services.memwal.writeMemory(body);
    return c.json(memory, 201);
  });

  route.post("/recall", async (c) => {
    const body = RecallMemoryBodySchema.parse(await c.req.json());
    const memories = await services.memwal.recall(body);
    return c.json({ memories });
  });

  return route;
}

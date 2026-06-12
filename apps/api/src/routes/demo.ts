import { Hono } from "hono";
import type { ApiServices } from "../app.js";
import { leadChen } from "../fixtures/demo-data.js";

// Demo seed API — 仅用于演示前预热界面。seed 出来的数据带 isDemoSeed 标记。
export function demoRoute(services: ApiServices) {
  const route = new Hono();

  route.post("/seed-real-estate", (c) => {
    const lead = services.store.upsertLead({
      ...leadChen,
      isDemoSeed: true,
    } as never);
    return c.json({ seeded: true, leadId: lead.id });
  });

  return route;
}

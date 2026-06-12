import { Hono } from "hono";
import type { ApiServices } from "../app.js";

export function leadsRoutes(services: ApiServices) {
  const route = new Hono();

  route.get("/", (c) => {
    const leads = services.store.listLeads();
    const items = leads.map((lead) => ({
      id: lead.id,
      displayName: lead.displayName,
      platform: lead.platform,
      status: lead.status,
      intentLevel: lead.intentLevel,
      summary: lead.summary,
      updatedAt: lead.updatedAt,
    }));
    return c.json({ items });
  });

  route.get("/:leadId", (c) => {
    const leadId = c.req.param("leadId");
    const lead = services.store.getLead(leadId);
    if (!lead) {
      return c.json({ error: { code: "LEAD_NOT_FOUND" } }, 404);
    }
    return c.json({ lead });
  });

  return route;
}

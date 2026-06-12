import { Hono } from "hono";
import type { ApiServices } from "../app.js";
import type { StoredLead } from "../store.js";

function toLeadListItem(lead: StoredLead) {
  return {
    id: lead.id,
    displayName: lead.displayName,
    platform: lead.platform,
    status: lead.status,
    intentLevel: lead.intentLevel,
    summary: lead.summary,
    updatedAt: lead.updatedAt,
    isDemoSeed: lead.isDemoSeed ?? false,
  };
}

export function dashboardRoutes(services: ApiServices) {
  const route = new Hono();

  route.get("/leads", (c) => {
    const leads = services.store.listLeads();
    const items = leads.map(toLeadListItem);
    return c.json({ items });
  });

  route.get("/leads/:leadId", (c) => {
    const leadId = c.req.param("leadId");
    const lead = services.store.getLead(leadId);
    if (!lead) {
      return c.json(
        { error: { code: "LEAD_NOT_FOUND", message: `Lead '${leadId}' was not found.` } },
        404,
      );
    }
    return c.json({
      lead,
      conversation: { messages: services.store.listConversationMessages(leadId) },
      timeline: services.store.listTimelineEvents(leadId),
      memories: services.store.listMemoryRefs(leadId),
      artifacts: services.store.listArtifactRefs(leadId),
    });
  });

  return route;
}

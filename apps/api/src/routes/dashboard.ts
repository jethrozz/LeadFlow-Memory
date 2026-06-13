import { Hono } from "hono";
import type { ApiServices } from "../app.js";
import type { StoredLead, StoredProfile } from "../store.js";

function toLeadListItem(lead: StoredLead, profile: StoredProfile | undefined) {
  return {
    id: lead.id,
    displayName: lead.displayName,
    platform: lead.platform,
    status: lead.status,
    intentLevel: lead.intentLevel,
    summary: lead.summary,
    updatedAt: lead.updatedAt,
    isDemoSeed: lead.isDemoSeed ?? false,
    // 侧边栏线索卡片展示区域与前两个需求标签
    district: profile?.fields.district?.value,
    needs: profile?.needs ?? [],
  };
}

export function dashboardRoutes(services: ApiServices) {
  const route = new Hono();

  route.get("/leads", (c) => {
    const items = services.store
      .listLeads()
      .map((lead) => toLeadListItem(lead, services.store.getProfile(lead.id)));
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
    const profile = services.store.getProfile(leadId);
    return c.json({
      lead: toLeadListItem(lead, profile),
      profile: {
        summary: profile?.summary ?? lead.summary ?? "",
        sourceNote: profile?.sourceNote,
        needs: profile?.needs ?? [],
        concerns: profile?.concerns ?? [],
        fields: profile?.fields ?? {},
      },
      conversation: { messages: services.store.listConversationMessages(leadId) },
      timeline: services.store.listTimelineEvents(leadId),
      memories: services.store.listMemoryRefs(leadId),
      artifacts: services.store.listArtifactRefs(leadId),
      nextFollowup: services.store.getNextFollowup(leadId) ?? null,
    });
  });

  return route;
}
